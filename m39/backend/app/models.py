from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class NodeType(str, Enum):
    IP = "IP"
    DOMAIN = "Domain"
    HASH = "Hash"
    CVE = "CVE"


class RelationshipType(str, Enum):
    RESOLVES_TO = "RESOLVES_TO"
    COMMUNICATES_WITH = "COMMUNICATES_WITH"
    HOSTS = "HOSTS"
    DOWNLOADS = "DOWNLOADS"
    EXPLOITS = "EXPLOITS"
    RELATED_TO = "RELATED_TO"
    BELONGS_TO = "BELONGS_TO"
    INDICATES = "INDICATES"


class ThreatNode(BaseModel):
    id: str
    label: NodeType
    name: str
    properties: dict[str, Any] = Field(default_factory=dict)


class ThreatRelationship(BaseModel):
    source_id: str
    target_id: str
    type: RelationshipType
    properties: dict[str, Any] = Field(default_factory=dict)


class GraphData(BaseModel):
    nodes: list[ThreatNode]
    relationships: list[ThreatRelationship]


class QueryRequest(BaseModel):
    ip: str
    max_depth: int = Field(default=2, ge=1, le=5)
    max_nodes: int = Field(default=5000, ge=1, le=20000)
    max_relationships: int = Field(default=10000, ge=1, le=50000)
    use_cache: bool = Field(default=True)


class GraphDataWithMetadata(GraphData):
    metadata: dict[str, Any] = Field(default_factory=dict)


class NodeCreateRequest(BaseModel):
    label: NodeType
    name: str
    properties: dict[str, Any] = Field(default_factory=dict)


class RelationshipCreateRequest(BaseModel):
    source_id: str
    target_id: str
    type: RelationshipType
    properties: dict[str, Any] = Field(default_factory=dict)


class NodeUpdateRequest(BaseModel):
    name: Optional[str] = None
    properties: Optional[dict[str, Any]] = None


class PredictionRequest(BaseModel):
    source_id: str
    target_id: str


class BatchPredictionRequest(BaseModel):
    pairs: list[tuple[str, str]]
    min_score: float = Field(default=0.0, ge=0.0, le=1.0)


class ThreatPredictionRequest(BaseModel):
    center_id: str
    max_depth: int = Field(default=3, ge=1, le=5)
    top_k: int = Field(default=20, ge=1, le=100)
    min_score: float = Field(default=0.3, ge=0.0, le=1.0)
    include_graph_data: bool = Field(default=True)


class LinkPredictionResult(BaseModel):
    source_id: str
    target_id: str
    score: float
    algorithms: dict[str, float]
    combined_score: float
    explanation: str
    predicted_relationship: str
    confidence: str


class ThreatPredictionResponse(BaseModel):
    center_id: str
    predictions: list[LinkPredictionResult]
    graph_data: Optional[GraphDataWithMetadata] = None
    prediction_metadata: dict[str, Any] = Field(default_factory=dict)
