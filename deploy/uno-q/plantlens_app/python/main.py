"""UNO Q PlantLens application entrypoint."""

import os
import secrets
import sys

from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

SOURCE_ROOT = "/app/source"
API_ROOT = f"{SOURCE_ROOT}/apps/api"
WEB_ROOT = "/app/web"

sys.path.insert(0, API_ROOT)
os.chdir(API_ROOT)
os.environ.setdefault("PLANTLENS_HOST", "0.0.0.0")
os.environ.setdefault("PLANTLENS_PORT", "8000")
# Local-only dev JWT key. It is regenerated on every container start and is
# never stored in source or exposed to the browser; the UI requests a token.
os.environ.setdefault("PLANTLENS_DEV_JWT_SECRET", secrets.token_urlsafe(48))
os.environ.setdefault("PLANTLENS_WEB_ORIGIN", "http://localhost:5173")

from app.main import app
from passive_gateway import gateway, router as passive_gateway_router


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code == 404:
                return await super().get_response("index.html", scope)
            raise
        if response.status_code == 404:
            return await super().get_response("index.html", scope)
        return response


# Routes must be registered before the catch-all SPA mount.
app.include_router(passive_gateway_router)
app.mount("/", SPAStaticFiles(directory=WEB_ROOT, html=True), name="plantlens-web")
gateway.start()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, workers=1)
