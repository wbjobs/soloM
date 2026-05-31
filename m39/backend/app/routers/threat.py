import time

from fastapi import APIRouter, HTTPException, Query

from app.models import (
    GraphData,
    GraphDataWithMetadata,
    LinkPredictionResult,
    NodeCreateRequest,
    NodeUpdateRequest,
    PredictionRequest,
    BatchPredictionRequest,
    QueryRequest,
    RelationshipCreateRequest,
    ThreatPredictionRequest,
    ThreatPredictionResponse,
)
from app.services import graph_service
from app.services.link_prediction import get_link_predictor, PredictionResult

router = APIRouter(prefix="/api/threat", tags=["Threat Intelligence"])


@router.post("/query", response_model=GraphDataWithMetadata, summary="查询恶意IP的关联图谱")
def query_by_ip(request: QueryRequest):
    start_time = time.time()
    result = graph_service.query_graph_by_ip(
        request.ip,
        request.max_depth,
        request.max_nodes,
        request.max_relationships,
        request.use_cache,
    )
    if not result.nodes:
        raise HTTPException(status_code=404, detail=f"IP '{request.ip}' 未找到关联数据")

    query_time_ms = (time.time() - start_time) * 1000
    node_count = len(result.nodes)
    rel_count = len(result.relationships)

    metadata = {
        "query_time_ms": round(query_time_ms, 2),
        "node_count": node_count,
        "relationship_count": rel_count,
        "query_depth": request.max_depth,
        "is_truncated": node_count >= request.max_nodes or rel_count >= request.max_relationships,
        "max_nodes_limit": request.max_nodes,
        "max_relationships_limit": request.max_relationships,
        "used_cache": request.use_cache,
    }

    return GraphDataWithMetadata(
        nodes=result.nodes,
        relationships=result.relationships,
        metadata=metadata,
    )


@router.get("/nodes", summary="获取所有节点列表")
def list_nodes(
    label: str | None = Query(None, description="按节点类型过滤: IP, Domain, Hash, CVE"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    return graph_service.get_all_nodes(label, skip, limit)


@router.post("/nodes", summary="创建新节点")
def create_node(request: NodeCreateRequest):
    try:
        return graph_service.create_node(
            request.label.value, request.name, request.properties
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/nodes/{node_id}", summary="获取节点详情")
def get_node(node_id: str):
    node = graph_service.get_node_by_id(node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"节点 '{node_id}' 不存在")
    return node


@router.put("/nodes/{node_id}", summary="更新节点")
def update_node(node_id: str, request: NodeUpdateRequest):
    node = graph_service.update_node(
        node_id, request.name, request.properties
    )
    if not node:
        raise HTTPException(status_code=404, detail=f"节点 '{node_id}' 不存在")
    return node


@router.delete("/nodes/{node_id}", summary="删除节点及其关系")
def delete_node(node_id: str):
    success = graph_service.delete_node(node_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"节点 '{node_id}' 不存在")
    return {"message": f"节点 '{node_id}' 及其关系已删除"}


@router.post("/relationships", summary="创建关系")
def create_relationship(request: RelationshipCreateRequest):
    rel = graph_service.create_relationship(
        request.source_id,
        request.target_id,
        request.type.value,
        request.properties,
    )
    if not rel:
        raise HTTPException(status_code=400, detail="无法创建关系，请检查源节点和目标节点是否存在")
    return rel


@router.delete("/relationships", summary="删除关系")
def delete_relationship(
    source_id: str = Query(...),
    target_id: str = Query(...),
    type: str = Query(...),
):
    success = graph_service.delete_relationship(source_id, target_id, type)
    if not success:
        raise HTTPException(status_code=404, detail="关系不存在")
    return {"message": "关系已删除"}


@router.get("/stats", summary="获取图谱统计信息")
def get_stats():
    return graph_service.get_graph_stats()


@router.get("/cache/stats", summary="获取缓存统计信息")
def get_cache_stats():
    return graph_service.get_cache_stats()


@router.delete("/cache/clear", summary="清除查询缓存")
def clear_cache():
    graph_service.clear_cache()
    get_link_predictor().clear_cache()
    return {"message": "所有缓存已清除"}


def _prediction_to_model(pred: PredictionResult) -> LinkPredictionResult:
    return LinkPredictionResult(
        source_id=pred.source_id,
        target_id=pred.target_id,
        score=pred.score,
        algorithms=pred.algorithms,
        combined_score=pred.combined_score,
        explanation=pred.explanation,
        predicted_relationship=pred.predicted_relationship,
        confidence=pred.confidence,
    )


@router.post("/predict/link", response_model=LinkPredictionResult, summary="预测两个节点之间的潜在关联")
def predict_link(request: PredictionRequest):
    predictor = get_link_predictor()
    start_time = time.time()

    pred = predictor.predict_link(request.source_id, request.target_id)
    pred_time_ms = (time.time() - start_time) * 1000

    result = _prediction_to_model(pred)
    return result


@router.post("/predict/batch", response_model=list[LinkPredictionResult], summary="批量预测节点对之间的潜在关联")
def predict_batch(request: BatchPredictionRequest):
    predictor = get_link_predictor()
    start_time = time.time()

    predictions = predictor.batch_predict_links(request.pairs, request.min_score)
    pred_time_ms = (time.time() - start_time) * 1000

    return [_prediction_to_model(p) for p in predictions]


@router.post("/predict/threats", response_model=ThreatPredictionResponse, summary="预测指定节点的潜在威胁链路")
def predict_threats(request: ThreatPredictionRequest):
    predictor = get_link_predictor()
    start_time = time.time()

    predictions, total_candidates = predictor.predict_potential_threats(
        request.center_id,
        request.max_depth,
        request.top_k,
        request.min_score,
    )

    pred_time_ms = (time.time() - start_time) * 1000

    graph_data = None
    if request.include_graph_data:
        try:
            graph_result = graph_service.query_graph_by_ip(
                request.center_id,
                max_depth=request.max_depth,
                max_nodes=2000,
                max_relationships=5000,
            )
            graph_data = GraphDataWithMetadata(
                nodes=graph_result.nodes,
                relationships=graph_result.relationships,
                metadata={"source": "prediction_query"},
            )
        except Exception:
            pass

    prediction_metadata = {
        "prediction_time_ms": round(pred_time_ms, 2),
        "total_candidates": total_candidates,
        "prediction_count": len(predictions),
        "center_node": request.center_id,
        "max_depth": request.max_depth,
        "min_score": request.min_score,
        "high_confidence_count": sum(1 for p in predictions if p.confidence == "high"),
        "medium_confidence_count": sum(1 for p in predictions if p.confidence == "medium"),
        "low_confidence_count": sum(1 for p in predictions if p.confidence == "low"),
    }

    return ThreatPredictionResponse(
        center_id=request.center_id,
        predictions=[_prediction_to_model(p) for p in predictions],
        graph_data=graph_data,
        prediction_metadata=prediction_metadata,
    )


@router.get("/predict/algorithms", summary="获取链路预测算法列表")
def get_prediction_algorithms():
    return {
        "algorithms": [
            {
                "name": "common_neighbors",
                "description": "共同邻居数 - 计算两个节点共享的邻居节点数量",
                "weight": 0.10,
            },
            {
                "name": "jaccard",
                "description": "Jaccard 系数 - 共同邻居与并集邻居的比例",
                "weight": 0.15,
            },
            {
                "name": "adamic_adar",
                "description": "Adamic-Adar 指数 - 基于共同邻居度数的加权和",
                "weight": 0.20,
            },
            {
                "name": "resource_allocation",
                "description": "资源分配指数 - 模拟资源在网络中的传播",
                "weight": 0.25,
            },
            {
                "name": "preferential_attachment",
                "description": "优先连接 - 基于节点度数乘积的预测",
                "weight": 0.05,
            },
            {
                "name": "embedding_similarity",
                "description": "图嵌入相似度 - 基于 GNN 风格节点表示学习的余弦相似度",
                "weight": 0.20,
            },
            {
                "name": "path_distance_score",
                "description": "路径距离评分 - 基于最短路径的 proximity 评分",
                "weight": 0.05,
            },
        ],
        "combination_method": "加权加权平均",
        "confidence_thresholds": {
            "high": 0.7,
            "medium": 0.4,
            "low": 0.0,
        },
    }


@router.delete("/predict/cache/clear", summary="清除预测模型缓存")
def clear_prediction_cache():
    get_link_predictor().clear_cache()
    return {"message": "预测模型缓存已清除"}
