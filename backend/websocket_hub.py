import json
from dataclasses import asdict, is_dataclass

from fastapi import WebSocket


class WebSocketHub:
    def __init__(self):
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._connections.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self._connections:
            self._connections.remove(ws)

    async def broadcast(self, message: dict):
        dead: list[WebSocket] = []
        for ws in self._connections:
            try:
                await ws.send_text(json.dumps(message, default=str))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def send_to(self, ws: WebSocket, message: dict):
        try:
            await ws.send_text(json.dumps(message, default=str))
        except Exception:
            self.disconnect(ws)


hub = WebSocketHub()


def make_live_message(frames: dict) -> dict:
    return {
        'type': 'LIVE',
        'payload': {
            tag_id: {
                'tag_id': f['tag_id'],
                'value': f['value'],
                'unit': f['unit'],
                'quality': f['quality'],
                'ts': f['ts'],
            }
            for tag_id, f in frames.items()
        },
    }


def make_alarm_message(alarm) -> dict:
    payload = asdict(alarm) if is_dataclass(alarm) else alarm
    return {'type': 'ALARM', 'payload': payload}


def make_situation_message(situations: list) -> dict:
    def sit_to_dict(s):
        return {
            'situation_id': s.situation_id,
            'title': s.title,
            'severity': s.severity,
            'confidence': s.confidence,
            'alarm_count': s.alarm_count,
            'root_alarm_id': s.root_alarm_id,
            'root_equipment_id': s.root_equipment_id,
            'affected_equipment': s.affected_equipment,
            'causal_path': s.causal_path,
            'edges_traversed': s.edges_traversed,
            'projected_consequence': s.projected_consequence,
            'time_to_limit_min': s.time_to_limit_min,
            'ts_created': s.ts_created,
            'ts_updated': s.ts_updated,
        }

    return {
        'type': 'SITUATION',
        'payload': [sit_to_dict(s) for s in situations],
    }


def make_conn_status_message(connected: bool, port: str, ok: int, errors: int) -> dict:
    return {
        'type': 'CONN_STATUS',
        'payload': {
            'connected': connected,
            'port': port,
            'ok_count': ok,
            'error_count': errors,
        },
    }