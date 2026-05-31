from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Tuple, Dict, Any
import asyncio
import json
import os

from genetic_algorithm import GeneticAlgorithm

app = FastAPI(title="物流配送路径优化系统")

app.mount("/static", StaticFiles(directory="static"), name="static")


class DeliveryPoint(BaseModel):
    x: float
    y: float
    earliest_time: float = 0.0
    latest_time: float = 1e9


class OptimizationRequest(BaseModel):
    warehouse: Tuple[float, float]
    delivery_points: List[DeliveryPoint]
    population_size: int = 100
    mutation_rate: float = 0.02
    crossover_rate: float = 0.8
    generations: int = 500
    use_2opt: bool = True
    speed: float = 1.0
    penalty_multiplier: float = 1000.0


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_message(self, message: dict, websocket: WebSocket):
        await websocket.send_text(json.dumps(message))


manager = ConnectionManager()


@app.get("/")
async def get_index():
    return FileResponse("static/index.html")


@app.post("/api/optimize")
async def optimize_route(request: OptimizationRequest):
    delivery_points_dicts = [p.model_dump() for p in request.delivery_points]
    
    ga = GeneticAlgorithm(
        warehouse=request.warehouse,
        delivery_points=delivery_points_dicts,
        population_size=request.population_size,
        mutation_rate=request.mutation_rate,
        crossover_rate=request.crossover_rate,
        generations=request.generations,
        use_2opt=request.use_2opt,
        speed=request.speed,
        penalty_multiplier=request.penalty_multiplier
    )
    
    result = await ga.run()
    
    return {
        "status": "completed",
        "best_distance": result["best_distance"],
        "total_cost": result["total_cost"],
        "penalty": result["penalty"],
        "overdue_count": result["overdue_count"],
        "overdue_points": result["overdue_points"],
        "point_info": result["point_info"],
        "best_route": result["best_route"],
        "route_coordinates": result["route_coordinates"]
    }


@app.websocket("/ws/optimize")
async def websocket_optimize(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            request_data = json.loads(data)
            
            warehouse = tuple(request_data["warehouse"])
            delivery_points = request_data["delivery_points"]
            population_size = request_data.get("population_size", 100)
            mutation_rate = request_data.get("mutation_rate", 0.02)
            crossover_rate = request_data.get("crossover_rate", 0.8)
            generations = request_data.get("generations", 500)
            use_2opt = request_data.get("use_2opt", True)
            speed = request_data.get("speed", 1.0)
            penalty_multiplier = request_data.get("penalty_multiplier", 1000.0)
            
            ga = GeneticAlgorithm(
                warehouse=warehouse,
                delivery_points=delivery_points,
                population_size=population_size,
                mutation_rate=mutation_rate,
                crossover_rate=crossover_rate,
                generations=generations,
                use_2opt=use_2opt,
                speed=speed,
                penalty_multiplier=penalty_multiplier
            )
            
            async def progress_callback(gen: int, progress_data: Dict[str, Any]):
                message = {
                    "type": "progress",
                    "generation": progress_data["generation"],
                    "distance": progress_data["distance"],
                    "total_cost": progress_data["total_cost"],
                    "penalty": progress_data["penalty"],
                    "overdue_count": progress_data["overdue_count"],
                    "overdue_points": progress_data["overdue_points"],
                    "point_info": progress_data["point_info"],
                    "route": progress_data["best_route"],
                    "route_coordinates": progress_data["route_coordinates"],
                    "total_generations": generations
                }
                await manager.send_message(message, websocket)
                await asyncio.sleep(0.01)
            
            result = await ga.run(callback=progress_callback)
            
            final_message = {
                "type": "completed",
                "best_distance": result["best_distance"],
                "total_cost": result["total_cost"],
                "penalty": result["penalty"],
                "overdue_count": result["overdue_count"],
                "overdue_points": result["overdue_points"],
                "point_info": result["point_info"],
                "best_route": result["best_route"],
                "route_coordinates": result["route_coordinates"]
            }
            await manager.send_message(final_message, websocket)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        error_message = {
            "type": "error",
            "message": str(e)
        }
        await manager.send_message(error_message, websocket)
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
