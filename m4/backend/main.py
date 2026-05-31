import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from md_engine import MDEngine

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"status": "MD Simulation Server is running"}


@app.websocket("/ws/simulate")
async def simulate(websocket: WebSocket):
    await websocket.accept()
    engine = None
    sim_task = None
    running = False

    async def simulation_loop():
        nonlocal running
        try:
            while running:
                for _ in range(engine.steps_per_frame):
                    engine.step()
                frame = engine.get_frame_data()
                await websocket.send_json(frame)
                await asyncio.sleep(0.016)
        except asyncio.CancelledError:
            pass

    async def stop_simulation():
        nonlocal running, sim_task
        running = False
        if sim_task is not None:
            sim_task.cancel()
            try:
                await sim_task
            except asyncio.CancelledError:
                pass
            sim_task = None

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "start":
                await stop_simulation()
                params = data.get("params", {})
                engine = MDEngine(**params)
                engine.initialize()
                frame = engine.get_frame_data()
                await websocket.send_json(frame)
                running = True
                sim_task = asyncio.create_task(simulation_loop())

            elif action == "pause":
                await stop_simulation()

            elif action == "resume":
                if engine is not None and not running:
                    running = True
                    sim_task = asyncio.create_task(simulation_loop())

            elif action == "reset":
                await stop_simulation()
                params = data.get("params", {})
                if params:
                    engine = MDEngine(**params)
                if engine is not None:
                    engine.initialize()
                    frame = engine.get_frame_data()
                    await websocket.send_json(frame)

            elif action == "step":
                if engine is not None:
                    for _ in range(engine.steps_per_frame):
                        engine.step()
                    frame = engine.get_frame_data()
                    await websocket.send_json(frame)

    except WebSocketDisconnect:
        await stop_simulation()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
