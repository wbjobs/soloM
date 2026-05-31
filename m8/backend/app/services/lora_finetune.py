import uuid
import math
import pickle
import asyncio
import random
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional, Callable, Tuple
from dataclasses import dataclass, field

from app.core.config import settings, FINETUNE_OUTPUT_PATH, LOG_PATH
from app.models.schemas import (
    FinetuneConfig,
    FinetuneTask,
    LossPoint,
    QAPair,
)
from app.services.dataset_manager import dataset_manager


@dataclass
class TrainingState:
    task_id: str
    status: str = "pending"
    current_epoch: int = 0
    total_epochs: int = 0
    current_step: int = 0
    total_steps: int = 0
    loss_history: List[LossPoint] = field(default_factory=list)
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    output_path: Optional[str] = None
    callbacks: List[Callable] = field(default_factory=list)


class LoRAFinetuneEngine:
    def __init__(self):
        self.tasks_file = LOG_PATH / "finetune_tasks.pkl"
        self._tasks: Dict[str, Dict[str, Any]] = self._load_tasks()
        self._running_tasks: Dict[str, TrainingState] = {}
        self._simulation_mode = True

    def _load_tasks(self) -> Dict[str, Dict[str, Any]]:
        if self.tasks_file.exists():
            try:
                with open(self.tasks_file, "rb") as f:
                    return pickle.load(f)
            except Exception:
                return {}
        return {}

    def _save_tasks(self) -> None:
        with open(self.tasks_file, "wb") as f:
            pickle.dump(self._tasks, f)

    def _generate_task_id(self) -> str:
        return f"ft_{uuid.uuid4().hex[:12]}"

    def _get_config(self, user_config: FinetuneConfig) -> Dict[str, Any]:
        config = {
            "base_model": user_config.base_model or settings.FINETUNE_BASE_MODEL,
            "num_epochs": user_config.num_epochs or settings.FINETUNE_NUM_EPOCHS,
            "batch_size": user_config.batch_size or settings.FINETUNE_BATCH_SIZE,
            "learning_rate": user_config.learning_rate or settings.FINETUNE_LEARNING_RATE,
            "lora_r": user_config.lora_r or settings.FINETUNE_LORA_R,
            "lora_alpha": user_config.lora_alpha or settings.FINETUNE_LORA_ALPHA,
            "lora_dropout": user_config.lora_dropout or settings.FINETUNE_LORA_DROPOUT,
            "max_seq_length": user_config.max_seq_length or settings.FINETUNE_MAX_SEQ_LENGTH,
            "dataset_id": user_config.dataset_id,
        }
        return config

    def _format_chat_template(self, qa: QAPair) -> str:
        if qa.context:
            return f"<|system|>你是一个专业的问答助手，请根据上下文回答问题。\n上下文: {qa.context}\n<|user|>{qa.question}\n<|assistant|>{qa.answer}"
        else:
            return f"<|user|>{qa.question}\n<|assistant|>{qa.answer}"

    def _calculate_total_steps(self, num_samples: int, batch_size: int, num_epochs: int) -> int:
        steps_per_epoch = math.ceil(num_samples / batch_size)
        return steps_per_epoch * num_epochs

    def _generate_loss_curve(self, total_steps: int) -> List[float]:
        losses = []
        current_loss = 2.0 + random.uniform(0, 0.5)
        
        for step in range(total_steps):
            decay = 0.05 * (step / total_steps)
            noise = random.uniform(-0.05, 0.05)
            current_loss = current_loss * (1 - decay * 0.1) + noise * 0.01
            current_loss = max(0.1, min(3.0, current_loss))
            losses.append(round(current_loss, 4))
        
        return losses

    async def _simulate_training(
        self,
        state: TrainingState,
        qa_pairs: List[QAPair],
        config: Dict[str, Any],
    ) -> None:
        try:
            state.status = "running"
            state.started_at = datetime.now()
            
            num_samples = len(qa_pairs)
            batch_size = config["batch_size"]
            num_epochs = config["num_epochs"]
            
            steps_per_epoch = math.ceil(num_samples / batch_size)
            state.total_steps = self._calculate_total_steps(num_samples, batch_size, num_epochs)
            state.total_epochs = num_epochs
            
            loss_curve = self._generate_loss_curve(state.total_steps)
            global_step = 0
            
            for epoch in range(1, num_epochs + 1):
                state.current_epoch = epoch
                
                for step_in_epoch in range(1, steps_per_epoch + 1):
                    await asyncio.sleep(0.3)
                    
                    loss = loss_curve[global_step]
                    loss_point = LossPoint(
                        step=global_step + 1,
                        loss=loss,
                        epoch=epoch
                    )
                    state.loss_history.append(loss_point)
                    state.current_step = global_step + 1
                    global_step += 1
                    
                    self._update_task_state(state)
                    await self._notify_callbacks(state)
            
            state.status = "completed"
            state.completed_at = datetime.now()
            state.output_path = str(FINETUNE_OUTPUT_PATH / state.task_id)
            
            output_dir = Path(state.output_path)
            output_dir.mkdir(exist_ok=True)
            
        except Exception as e:
            state.status = "failed"
            state.error_message = str(e)
            state.completed_at = datetime.now()
        finally:
            self._update_task_state(state)
            await self._notify_callbacks(state)

    async def _real_training(
        self,
        state: TrainingState,
        qa_pairs: List[QAPair],
        config: Dict[str, Any],
    ) -> None:
        try:
            import torch
            from datasets import Dataset as HFDataset
            from transformers import (
                AutoTokenizer,
                AutoModelForCausalLM,
                TrainingArguments,
            )
            from peft import LoraConfig, get_peft_model
            from trl import SFTTrainer
            
            state.status = "running"
            state.started_at = datetime.now()
            
            device = settings.FINETUNE_DEVICE
            base_model = config["base_model"]
            
            tokenizer = AutoTokenizer.from_pretrained(base_model)
            tokenizer.pad_token = tokenizer.eos_token
            tokenizer.padding_side = "right"
            
            model = AutoModelForCausalLM.from_pretrained(
                base_model,
                torch_dtype=torch.float16 if device == "cuda" else torch.float32,
                device_map="auto" if device == "cuda" else None,
            )
            
            formatted_data = [
                {"text": self._format_chat_template(qa)}
                for qa in qa_pairs
            ]
            hf_dataset = HFDataset.from_list(formatted_data)
            
            num_samples = len(qa_pairs)
            batch_size = config["batch_size"]
            num_epochs = config["num_epochs"]
            steps_per_epoch = math.ceil(num_samples / batch_size)
            state.total_steps = steps_per_epoch * num_epochs
            state.total_epochs = num_epochs
            
            lora_config = LoraConfig(
                r=config["lora_r"],
                lora_alpha=config["lora_alpha"],
                lora_dropout=config["lora_dropout"],
                bias="none",
                task_type="CAUSAL_LM",
                target_modules=["q_proj", "v_proj"],
            )
            
            model = get_peft_model(model, lora_config)
            
            output_dir = str(FINETUNE_OUTPUT_PATH / state.task_id)
            state.output_path = output_dir
            
            def progress_callback(step: int, epoch: int, loss: float):
                loss_point = LossPoint(step=step, loss=loss, epoch=epoch)
                state.loss_history.append(loss_point)
                state.current_step = step
                state.current_epoch = epoch
                self._update_task_state(state)
            
            training_args = TrainingArguments(
                output_dir=output_dir,
                per_device_train_batch_size=batch_size,
                learning_rate=config["learning_rate"],
                num_train_epochs=num_epochs,
                logging_steps=1,
                save_strategy="epoch",
                fp16=(device == "cuda"),
            )
            
            class CustomTrainer(SFTTrainer):
                def __init__(self, *args, callback=None, **kwargs):
                    super().__init__(*args, **kwargs)
                    self._callback = callback
                    self._step_count = 0
                    self._epoch_count = 1
                
                def training_step(self, *args, **kwargs):
                    loss = super().training_step(*args, **kwargs)
                    self._step_count += 1
                    if self._callback:
                        self._callback(
                            self._step_count,
                            self._epoch_count,
                            loss.item()
                        )
                    return loss
            
            trainer = CustomTrainer(
                model=model,
                train_dataset=hf_dataset,
                args=training_args,
                tokenizer=tokenizer,
                peft_config=lora_config,
                max_seq_length=config["max_seq_length"],
                dataset_text_field="text",
                callback=progress_callback,
            )
            
            trainer.train()
            
            model.save_pretrained(output_dir)
            tokenizer.save_pretrained(output_dir)
            
            state.status = "completed"
            state.completed_at = datetime.now()
            
        except ImportError as e:
            state.status = "failed"
            state.error_message = f"Missing dependencies for real training: {str(e)}. Running in simulation mode."
            state.completed_at = datetime.now()
        except Exception as e:
            state.status = "failed"
            state.error_message = str(e)
            state.completed_at = datetime.now()
        finally:
            self._update_task_state(state)
            await self._notify_callbacks(state)

    def _update_task_state(self, state: TrainingState) -> None:
        task_data = self._tasks.get(state.task_id, {})
        task_data.update({
            "task_id": state.task_id,
            "status": state.status,
            "current_epoch": state.current_epoch,
            "total_epochs": state.total_epochs,
            "current_step": state.current_step,
            "total_steps": state.total_steps,
            "loss_history": [lp.dict() for lp in state.loss_history],
            "error_message": state.error_message,
            "started_at": state.started_at,
            "completed_at": state.completed_at,
            "output_path": state.output_path,
        })
        self._tasks[state.task_id] = task_data
        self._save_tasks()

    async def _notify_callbacks(self, state: TrainingState) -> None:
        for callback in state.callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(state)
                else:
                    callback(state)
            except Exception as e:
                print(f"Callback error: {e}")

    async def start_finetuning(
        self,
        config: FinetuneConfig,
        callback: Optional[Callable] = None,
    ) -> Tuple[str, str]:
        dataset = dataset_manager.get_dataset_info(config.dataset_id)
        if not dataset:
            raise ValueError(f"Dataset not found: {config.dataset_id}")
        
        qa_pairs = dataset_manager.get_qa_pairs(config.dataset_id)
        if len(qa_pairs) == 0:
            raise ValueError("Dataset is empty")
        
        task_id = self._generate_task_id()
        full_config = self._get_config(config)
        
        task_data = {
            "task_id": task_id,
            "dataset_id": config.dataset_id,
            "dataset_name": dataset.name,
            "base_model": full_config["base_model"],
            "status": "pending",
            "config": full_config,
            "created_at": datetime.now(),
            "current_epoch": 0,
            "total_epochs": full_config["num_epochs"],
            "current_step": 0,
            "total_steps": 0,
            "loss_history": [],
            "error_message": None,
            "output_path": None,
        }
        self._tasks[task_id] = task_data
        self._save_tasks()
        
        state = TrainingState(
            task_id=task_id,
            status="pending",
            callbacks=[callback] if callback else [],
        )
        self._running_tasks[task_id] = state
        
        if self._simulation_mode:
            asyncio.create_task(self._simulate_training(state, qa_pairs, full_config))
        else:
            asyncio.create_task(self._real_training(state, qa_pairs, full_config))
        
        return task_id, dataset.name

    def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        if task_id in self._running_tasks:
            state = self._running_tasks[task_id]
            return {
                "task_id": state.task_id,
                "status": state.status,
                "current_epoch": state.current_epoch,
                "total_epochs": state.total_epochs,
                "current_step": state.current_step,
                "total_steps": state.total_steps,
                "loss_history": state.loss_history,
                "error_message": state.error_message,
            }
        
        return self._tasks.get(task_id)

    def list_tasks(self) -> List[Dict[str, Any]]:
        tasks = list(self._tasks.values())
        for task in tasks:
            if task["task_id"] in self._running_tasks:
                state = self._running_tasks[task["task_id"]]
                task["status"] = state.status
                task["current_epoch"] = state.current_epoch
                task["total_epochs"] = state.total_epochs
                task["current_step"] = state.current_step
                task["total_steps"] = state.total_steps
                task["loss_history"] = state.loss_history
        
        return sorted(tasks, key=lambda x: x["created_at"], reverse=True)

    def cancel_task(self, task_id: str) -> bool:
        if task_id not in self._running_tasks:
            return False
        
        state = self._running_tasks[task_id]
        if state.status in ["completed", "failed", "cancelled"]:
            return False
        
        state.status = "cancelled"
        state.completed_at = datetime.now()
        self._update_task_state(state)
        
        return True

    def add_callback(self, task_id: str, callback: Callable) -> bool:
        if task_id not in self._running_tasks:
            return False
        self._running_tasks[task_id].callbacks.append(callback)
        return True


finetune_engine = LoRAFinetuneEngine()
