from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import json
import os
import base64
from datetime import datetime
from PIL import Image
import io

app = Flask(__name__)
CORS(app)

CONFIG_DIR = os.path.join(os.path.dirname(__file__), 'configs')
THUMBNAIL_DIR = os.path.join(os.path.dirname(__file__), 'thumbnails')

os.makedirs(CONFIG_DIR, exist_ok=True)
os.makedirs(THUMBNAIL_DIR, exist_ok=True)

def get_timestamp():
    return datetime.now().strftime('%Y%m%d_%H%M%S')

@app.route('/api/config', methods=['POST'])
def save_config():
    try:
        config_data = request.json
        timestamp = get_timestamp()
        filename = f'config_{timestamp}.json'
        filepath = os.path.join(CONFIG_DIR, filename)
        
        config_data['saved_at'] = timestamp
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, indent=2, ensure_ascii=False)
        
        return jsonify({
            'success': True,
            'message': '配置已保存',
            'filename': filename
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/configs', methods=['GET'])
def list_configs():
    try:
        configs = []
        for filename in os.listdir(CONFIG_DIR):
            if filename.endswith('.json'):
                filepath = os.path.join(CONFIG_DIR, filename)
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    configs.append({
                        'filename': filename,
                        'data': data
                    })
        
        configs.sort(key=lambda x: x['filename'], reverse=True)
        return jsonify(configs), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/config/<filename>', methods=['GET'])
def get_config(filename):
    try:
        filepath = os.path.join(CONFIG_DIR, filename)
        if not os.path.exists(filepath):
            return jsonify({'error': '配置文件不存在'}), 404
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        return jsonify(data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/thumbnail', methods=['POST'])
def save_thumbnail():
    try:
        data = request.json
        thumbnail_data = data.get('thumbnail', '')
        
        if not thumbnail_data:
            return jsonify({'error': '没有缩略图数据'}), 400
        
        header, encoded = thumbnail_data.split(',', 1)
        image_data = base64.b64decode(encoded)
        
        image = Image.open(io.BytesIO(image_data))
        
        timestamp = get_timestamp()
        filename = f'thumbnail_{timestamp}.png'
        filepath = os.path.join(THUMBNAIL_DIR, filename)
        
        image.save(filepath, 'PNG')
        
        config_filename = f'config_{timestamp}.json'
        config_filepath = os.path.join(CONFIG_DIR, config_filename)
        
        config_data = {
            'viscosity': data.get('viscosity'),
            'diffusion': data.get('diffusion'),
            'dt': data.get('dt'),
            'resolution': data.get('resolution'),
            'thumbnail': filename,
            'saved_at': timestamp
        }
        
        with open(config_filepath, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, indent=2, ensure_ascii=False)
        
        return jsonify({
            'success': True,
            'message': '缩略图已保存',
            'filename': filename
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/thumbnails', methods=['GET'])
def list_thumbnails():
    try:
        thumbnails = []
        for filename in os.listdir(THUMBNAIL_DIR):
            if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                thumbnails.append({
                    'filename': filename,
                    'url': f'/thumbnails/{filename}'
                })
        
        thumbnails.sort(key=lambda x: x['filename'], reverse=True)
        return jsonify(thumbnails), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/thumbnails/<filename>')
def get_thumbnail(filename):
    return send_from_directory(THUMBNAIL_DIR, filename)

@app.route('/')
def index():
    return jsonify({
        'name': '流体模拟后端服务',
        'version': '1.0.0',
        'endpoints': {
            'POST /api/config': '保存配置',
            'GET /api/configs': '获取所有配置列表',
            'GET /api/config/<filename>': '获取单个配置',
            'POST /api/thumbnail': '保存缩略图',
            'GET /api/thumbnails': '获取所有缩略图列表',
            'GET /thumbnails/<filename>': '获取缩略图文件'
        }
    })

if __name__ == '__main__':
    print('流体模拟后端服务启动中...')
    print(f'配置目录: {CONFIG_DIR}')
    print(f'缩略图目录: {THUMBNAIL_DIR}')
    print('服务地址: http://localhost:5000')
    app.run(host='0.0.0.0', port=5000, debug=True)
