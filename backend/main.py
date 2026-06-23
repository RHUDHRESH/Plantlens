import asyncio
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from action_evaluator import evaluate_actions_for_situation
from alarm_engine import get_active_alarms, get_alarm_rate_per_10min, process_frames
from audit_ledger import append_entry, get_recent_entries, log_acknowledgement, log_alarm
from calm_card import generate_calm_card
from dag_engine import get_situation, get_situations, process_alarm_clear, process_alarm_event
from model_loader import get_model, load_model
from modbus_poller import config as modbus_config
from modbus_poller import get_state, poll_loop, set_callbacks
from tag_decoder import frames_to_dict
from websocket_hub import (
    hub,
    make_alarm_message,
    make_conn_status_message,
    make_live_message,
    make_situation_message,
)

BACKEND_DIR = Path(__file__).parent
FRONTEND_DIST = BACKEND_DIR.parent / 'apps' / 'web' / 'dist'


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_model()

    async def on_frames(frames):
        frame_dict = frames_to_dict(frames)
        await hub.broadcast(make_live_message(frame_dict))

        alarm_events = process_frames(frames)
        for event in alarm_events:
            log_alarm(event)
            await hub.broadcast(make_alarm_message(event))

            if event.state == 'ACTIVE':
                situations = process_alarm_event(event)
            else:
                process_alarm_clear(event)
                situations = get_situations()

            await hub.broadcast(make_situation_message(situations))

    async def on_status(status):
        await hub.broadcast(status)

    set_callbacks(on_frames, on_status)
    task = None
    if os.getenv('PLANTLENS_SKIP_POLL') != '1':
        task = asyncio.create_task(poll_loop())
        print('[main] Modbus poll loop started.')
    yield
    if task is not None:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title='PlantLens Backend', version='1.0.0', lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

if FRONTEND_DIST.is_dir():
    app.mount('/app', StaticFiles(directory=str(FRONTEND_DIST), html=True), name='frontend')


@app.websocket('/ws/live')
async def websocket_endpoint(ws: WebSocket):
    await hub.connect(ws)

    state = get_state()
    await hub.send_to(ws, make_conn_status_message(
        state.connected, modbus_config.port, state.ok_count, state.error_count,
    ))

    for alarm in get_active_alarms():
        await hub.send_to(ws, make_alarm_message(alarm))

    await hub.send_to(ws, make_situation_message(get_situations()))

    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        hub.disconnect(ws)


@app.get('/api/health')
def health():
    return {'status': 'ok', 'service': 'plantlens-backend'}


@app.get('/api/model')
def get_model_endpoint():
    model = get_model()
    return {
        'tag_count': len(model.tag_list),
        'edge_count': len(model.graph_edges),
        'tags': [t.model_dump() for t in model.tag_list],
        'edges': [e.model_dump() for e in model.graph_edges],
        'plant': model.plant,
        'plant_layout': model.plant_layout,
    }


@app.get('/api/situations')
def list_situations():
    return {'situations': [
        {
            'situation_id': s.situation_id,
            'title': s.title,
            'severity': s.severity,
            'confidence': s.confidence,
            'alarm_count': s.alarm_count,
            'affected_equipment': s.affected_equipment,
        }
        for s in get_situations()
    ]}


@app.get('/api/calm-card/{situation_id}')
def get_calm_card(situation_id: str):
    sit = get_situation(situation_id)
    if not sit:
        raise HTTPException(404, 'Situation not found')
    card = generate_calm_card(sit)
    return {'calm_card': card.__dict__}


@app.get('/api/actions/{situation_id}')
def get_actions(situation_id: str, role: str = 'operator'):
    sit = get_situation(situation_id)
    if not sit:
        raise HTTPException(404, 'Situation not found')
    evaluations = evaluate_actions_for_situation(sit, role)
    return {'actions': [e.__dict__ for e in evaluations]}


class AckBody(BaseModel):
    user_id: str
    role: str
    marked_as: str
    note: Optional[str] = ''


@app.post('/api/ack/{situation_id}')
def acknowledge(situation_id: str, body: AckBody):
    entry = log_acknowledgement(
        situation_id=situation_id,
        user_id=body.user_id,
        role=body.role,
        marked_as=body.marked_as,
        note=body.note or '',
    )
    return {'status': 'acknowledged', 'audit_entry': entry}


@app.get('/api/audit')
def get_audit(n: int = 50):
    return {'entries': get_recent_entries(n)}


@app.get('/api/ports')
def list_ports():
    import serial.tools.list_ports
    ports = [p.device for p in serial.tools.list_ports.comports()]
    return {'ports': ports}


class ConnectionBody(BaseModel):
    port: str
    baudrate: int = 9600
    parity: str = 'N'
    slave_id: int = 1
    poll_hz: float = 10.0


@app.post('/api/connection')
def set_connection(body: ConnectionBody):
    modbus_config.port = body.port
    modbus_config.baudrate = body.baudrate
    modbus_config.parity = body.parity
    modbus_config.slave_id = body.slave_id
    modbus_config.poll_hz = body.poll_hz
    return {'status': 'config_updated', 'config': body.model_dump()}


@app.get('/api/connection/status')
def connection_status():
    state = get_state()
    return {
        'connected': state.connected,
        'port': modbus_config.port,
        'ok_count': state.ok_count,
        'error_count': state.error_count,
        'last_poll_ts': state.last_poll_ts,
        'alarm_rate_per_10min': get_alarm_rate_per_10min(),
    }


@app.post('/api/scan')
async def scan_registers():
    from modbus_poller import _read_all_registers
    from tag_decoder import decode_float32

    regs = await _read_all_registers()
    if regs is None:
        return {'error': 'No response from slave. Check connection.'}

    results = []
    for addr in range(0, 42, 2):
        pair = regs[addr:addr + 2] if addr + 1 < len(regs) else None
        if pair:
            val = decode_float32(pair, 'AB')
            results.append({
                'address': addr,
                'registers': pair,
                'decoded_float': round(val, 3) if val is not None else None,
                'suggested_tag': f'UNKNOWN.channel_{addr // 2}',
            })
    return {'scan_results': results, 'total_registers': len(regs)}


class BindingsBody(BaseModel):
    bindings: list[dict]


@app.post('/api/bindings')
def commit_bindings(body: BindingsBody):
    tag_list_path = BACKEND_DIR / 'data' / 'tag_list.json'
    with open(tag_list_path) as f:
        current = json.load(f)

    for binding in body.bindings:
        for tag in current['tags']:
            if tag['tag_id'] == binding['tag_id']:
                tag.update(binding)

    with open(tag_list_path, 'w') as f:
        json.dump(current, f, indent=2)

    load_model()

    entry = append_entry('MODEL_UPDATE', {'bindings_updated': len(body.bindings)})
    return {'status': 'committed', 'audit_entry': entry}