import uuid
import logging
from flask import Flask, request, jsonify
from anomaly_detector import AnomalyDetector

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
detector = AnomalyDetector()


@app.before_request
def add_request_id():
    request_id = request.headers.get('X-Request-ID', str(uuid.uuid4()))
    request.request_id = request_id


@app.after_request
def add_request_id_header(response):
    response.headers['X-Request-ID'] = getattr(request, 'request_id', '')
    return response


@app.errorhandler(Exception)
def handle_exception(e):
    logger.error(f"Request {request.request_id} error: {str(e)}", exc_info=True)
    return jsonify({
        'error': str(e),
        'request_id': request.request_id,
        'success': False
    }), 500


@app.errorhandler(400)
def handle_bad_request(e):
    return jsonify({
        'error': 'Bad request',
        'request_id': request.request_id,
        'success': False
    }), 400


@app.errorhandler(404)
def handle_not_found(e):
    return jsonify({
        'error': 'Not found',
        'request_id': request.request_id,
        'success': False
    }), 404


@app.route('/api/v1/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy',
        'request_id': request.request_id,
        'success': True
    })


@app.route('/api/v1/models', methods=['GET'])
def get_models():
    models = detector.get_all_models()
    return jsonify({
        'models': models,
        'count': len(models),
        'request_id': request.request_id,
        'success': True
    })


@app.route('/api/v1/models/<path:service_pair>', methods=['DELETE'])
def delete_model(service_pair):
    deleted = detector.delete_model(service_pair)
    if not deleted:
        return jsonify({
            'error': f'Model {service_pair} not found',
            'request_id': request.request_id,
            'success': False
        }), 404
    return jsonify({
        'message': f'Model {service_pair} deleted',
        'request_id': request.request_id,
        'success': True
    })


@app.route('/api/v1/train', methods=['POST'])
def train():
    data = request.get_json()
    if not isinstance(data, list):
        return jsonify({
            'error': 'Request body must be an array',
            'request_id': request.request_id,
            'success': False
        }), 400

    results = []
    for item in data:
        service_pair = item.get('service_pair')
        history_data = item.get('history_data', [])

        if not service_pair or not history_data:
            results.append({
                'service_pair': service_pair,
                'success': False,
                'error': 'service_pair and history_data are required'
            })
            continue

        try:
            detector.train(service_pair, history_data)
            results.append({
                'service_pair': service_pair,
                'success': True,
                'baseline': detector.get_baseline(service_pair)
            })
        except Exception as e:
            results.append({
                'service_pair': service_pair,
                'success': False,
                'error': str(e)
            })

    return jsonify({
        'results': results,
        'request_id': request.request_id,
        'success': True
    })


@app.route('/api/v1/detect', methods=['POST'])
def detect():
    data = request.get_json()
    if not isinstance(data, list):
        return jsonify({
            'error': 'Request body must be an array',
            'request_id': request.request_id,
            'success': False
        }), 400

    results = []
    for item in data:
        service_pair = item.get('service_pair')
        latency = item.get('latency')
        timestamp = item.get('timestamp')

        if not service_pair or latency is None or timestamp is None:
            results.append({
                'service_pair': service_pair,
                'success': False,
                'error': 'service_pair, latency and timestamp are required'
            })
            continue

        try:
            detection = detector.detect(service_pair, float(latency), float(timestamp))
            detection['service_pair'] = service_pair
            detection['success'] = True
            results.append(detection)
        except Exception as e:
            results.append({
                'service_pair': service_pair,
                'success': False,
                'error': str(e)
            })

    return jsonify({
        'results': results,
        'request_id': request.request_id,
        'success': True
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
