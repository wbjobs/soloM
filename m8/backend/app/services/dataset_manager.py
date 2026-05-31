import json
import csv
import uuid
import pickle
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from app.core.config import settings, DATASET_PATH
from app.models.schemas import QAPair, DatasetInfo


class DatasetManager:
    def __init__(self):
        self.metadata_file = DATASET_PATH / "metadata.pkl"
        self._metadata: Dict[str, Dict[str, Any]] = self._load_metadata()

    def _load_metadata(self) -> Dict[str, Dict[str, Any]]:
        if self.metadata_file.exists():
            try:
                with open(self.metadata_file, "rb") as f:
                    return pickle.load(f)
            except Exception:
                return {}
        return {}

    def _save_metadata(self) -> None:
        with open(self.metadata_file, "wb") as f:
            pickle.dump(self._metadata, f)

    def _generate_id(self) -> str:
        return f"ds_{uuid.uuid4().hex[:12]}"

    def parse_jsonl(self, file_path: Path) -> List[QAPair]:
        qa_pairs = []
        with open(file_path, "r", encoding="utf-8") as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    question = data.get("question") or data.get("q") or data.get("query") or ""
                    answer = data.get("answer") or data.get("a") or data.get("response") or ""
                    context = data.get("context") or data.get("ctx") or data.get("passage")
                    
                    if question and answer:
                        qa_pairs.append(QAPair(
                            question=question,
                            answer=answer,
                            context=context
                        ))
                except json.JSONDecodeError as e:
                    print(f"Warning: Line {line_num} is not valid JSON: {e}")
                    continue
        return qa_pairs

    def parse_csv(self, file_path: Path) -> List[QAPair]:
        qa_pairs = []
        with open(file_path, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames or []
            
            q_col = next((h for h in headers if h.lower() in ["question", "q", "query", "问题"]), None)
            a_col = next((h for h in headers if h.lower() in ["answer", "a", "response", "回答"]), None)
            c_col = next((h for h in headers if h.lower() in ["context", "ctx", "passage", "上下文"]), None)
            
            if not q_col or not a_col:
                if len(headers) >= 2:
                    q_col, a_col = headers[0], headers[1]
                    c_col = headers[2] if len(headers) >= 3 else None
                else:
                    raise ValueError("CSV file must have at least question and answer columns")
            
            for row in reader:
                question = row.get(q_col, "").strip()
                answer = row.get(a_col, "").strip()
                context = row.get(c_col, "").strip() if c_col else None
                
                if question and answer:
                    qa_pairs.append(QAPair(
                        question=question,
                        answer=answer,
                        context=context if context else None
                    ))
        return qa_pairs

    def _detect_format(self, file_name: str) -> str:
        suffix = Path(file_name).suffix.lower()
        if suffix == ".jsonl":
            return "jsonl"
        elif suffix == ".csv":
            return "csv"
        else:
            raise ValueError(f"Unsupported file format: {suffix}")

    def upload_dataset(
        self,
        source_file_path: str,
        original_file_name: str,
        dataset_name: Optional[str] = None
    ) -> Tuple[str, int]:
        source_path = Path(source_file_path)
        if not source_path.exists():
            raise FileNotFoundError(f"File not found: {source_file_path}")

        file_format = self._detect_format(original_file_name)
        
        try:
            if file_format == "jsonl":
                qa_pairs = self.parse_jsonl(source_path)
            else:
                qa_pairs = self.parse_csv(source_path)
        except Exception as e:
            raise ValueError(f"Failed to parse dataset: {str(e)}")

        if len(qa_pairs) == 0:
            raise ValueError("No valid QA pairs found in the dataset")

        dataset_id = self._generate_id()
        dataset_dir = DATASET_PATH / dataset_id
        dataset_dir.mkdir(exist_ok=True)

        data_file = dataset_dir / f"data.{file_format}"
        source_path.rename(data_file)

        qa_list = [qa.dict() for qa in qa_pairs]
        with open(dataset_dir / "qa_pairs.json", "w", encoding="utf-8") as f:
            json.dump(qa_list, f, ensure_ascii=False, indent=2)

        metadata = {
            "id": dataset_id,
            "name": dataset_name or Path(original_file_name).stem,
            "file_name": original_file_name,
            "format": file_format,
            "total_samples": len(qa_pairs),
            "size_bytes": data_file.stat().st_size,
            "created_at": datetime.now(),
            "data_file": str(data_file),
            "qa_pairs_file": str(dataset_dir / "qa_pairs.json")
        }

        self._metadata[dataset_id] = metadata
        self._save_metadata()

        return dataset_id, len(qa_pairs)

    def get_dataset_info(self, dataset_id: str) -> Optional[DatasetInfo]:
        metadata = self._metadata.get(dataset_id)
        if not metadata:
            return None
        
        return DatasetInfo(
            id=metadata["id"],
            name=metadata["name"],
            file_name=metadata["file_name"],
            total_samples=metadata["total_samples"],
            created_at=metadata["created_at"],
            format=metadata["format"],
            size_bytes=metadata["size_bytes"]
        )

    def list_datasets(self) -> List[DatasetInfo]:
        datasets = []
        for metadata in self._metadata.values():
            datasets.append(DatasetInfo(
                id=metadata["id"],
                name=metadata["name"],
                file_name=metadata["file_name"],
                total_samples=metadata["total_samples"],
                created_at=metadata["created_at"],
                format=metadata["format"],
                size_bytes=metadata["size_bytes"]
            ))
        return sorted(datasets, key=lambda x: x.created_at, reverse=True)

    def get_qa_pairs(self, dataset_id: str) -> List[QAPair]:
        metadata = self._metadata.get(dataset_id)
        if not metadata:
            raise ValueError(f"Dataset not found: {dataset_id}")
        
        qa_file = Path(metadata["qa_pairs_file"])
        if not qa_file.exists():
            raise FileNotFoundError(f"QA pairs file not found")
        
        with open(qa_file, "r", encoding="utf-8") as f:
            qa_list = json.load(f)
        
        return [QAPair(**qa) for qa in qa_list]

    def delete_dataset(self, dataset_id: str) -> bool:
        metadata = self._metadata.get(dataset_id)
        if not metadata:
            return False
        
        dataset_dir = DATASET_PATH / dataset_id
        if dataset_dir.exists():
            import shutil
            shutil.rmtree(dataset_dir)
        
        del self._metadata[dataset_id]
        self._save_metadata()
        return True

    def export_to_jsonl(self, dataset_id: str, output_path: str) -> None:
        qa_pairs = self.get_qa_pairs(dataset_id)
        
        with open(output_path, "w", encoding="utf-8") as f:
            for qa in qa_pairs:
                line = json.dumps(qa.dict(), ensure_ascii=False)
                f.write(line + "\n")

    def validate_dataset(self, dataset_id: str) -> Dict[str, Any]:
        qa_pairs = self.get_qa_pairs(dataset_id)
        
        stats = {
            "total": len(qa_pairs),
            "with_context": 0,
            "avg_question_length": 0,
            "avg_answer_length": 0,
            "min_question_length": float("inf"),
            "max_question_length": 0,
            "min_answer_length": float("inf"),
            "max_answer_length": 0,
        }
        
        if qa_pairs:
            for qa in qa_pairs:
                if qa.context:
                    stats["with_context"] += 1
                q_len = len(qa.question)
                a_len = len(qa.answer)
                stats["avg_question_length"] += q_len
                stats["avg_answer_length"] += a_len
                stats["min_question_length"] = min(stats["min_question_length"], q_len)
                stats["max_question_length"] = max(stats["max_question_length"], q_len)
                stats["min_answer_length"] = min(stats["min_answer_length"], a_len)
                stats["max_answer_length"] = max(stats["max_answer_length"], a_len)
            
            stats["avg_question_length"] = round(stats["avg_question_length"] / len(qa_pairs), 2)
            stats["avg_answer_length"] = round(stats["avg_answer_length"] / len(qa_pairs), 2)
        
        return stats


dataset_manager = DatasetManager()
