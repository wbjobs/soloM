from flask import Flask, jsonify, request
from flask_cors import CORS
from scheduler import JobStore, Scheduler

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

store = JobStore()
scheduler = Scheduler(store)

scheduler.compensate_missed()
store.start_heartbeat()
scheduler.start()


@app.route("/api/jobs", methods=["GET"])
def get_jobs():
    jobs = store.get_all_jobs()
    return jsonify({"jobs": jobs})


@app.route("/api/jobs", methods=["POST"])
def create_job():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    name = data.get("name", "").strip()
    cron_expr = data.get("cron_expr", "").strip()
    command = data.get("command", "").strip()
    timeout = data.get("timeout", 30)

    if not name or not cron_expr or not command:
        return jsonify({"error": "name, cron_expr, and command are required"}), 400

    try:
        timeout = int(timeout)
        if timeout < 1:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "timeout must be a positive integer (seconds)"}), 400

    from croniter import croniter
    if not croniter.is_valid(cron_expr):
        return jsonify({"error": f"Invalid cron expression: {cron_expr}"}), 400

    job = store.add_job(name, cron_expr, command, timeout=timeout)
    return jsonify({"job": job}), 201


@app.route("/api/jobs/<job_id>", methods=["DELETE"])
def delete_job(job_id):
    if store.delete_job(job_id):
        return jsonify({"message": "Job deleted"})
    return jsonify({"error": "Job not found"}), 404


@app.route("/api/jobs/<job_id>/pause", methods=["PUT"])
def pause_job(job_id):
    if store.pause_job(job_id):
        return jsonify({"message": "Job paused"})
    return jsonify({"error": "Job not found"}), 404


@app.route("/api/jobs/<job_id>/resume", methods=["PUT"])
def resume_job(job_id):
    if store.resume_job(job_id):
        return jsonify({"message": "Job resumed"})
    return jsonify({"error": "Job not found"}), 404


if __name__ == "__main__":
    try:
        app.run(host="0.0.0.0", port=5500, debug=False)
    finally:
        scheduler.stop()
        store.stop_heartbeat()
