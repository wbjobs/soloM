import os
import tempfile
import hashlib
import numpy as np
from io import BytesIO
from flask import Flask, request, jsonify, send_from_directory, send_file, Response
from flask_cors import CORS
from pydub import AudioSegment

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = tempfile.mkdtemp()
AUDIO_CACHE = {}
ALLOWED_EXTENSIONS = {'mp3'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def downsample_fast(audio_data, target_samples):
    n = len(audio_data)
    if n <= target_samples:
        result = np.empty(n * 2, dtype=np.float32)
        result[0::2] = audio_data
        result[1::2] = audio_data
        return result.tolist()
    
    ratio = n // target_samples
    usable_len = target_samples * ratio
    reshaped = audio_data[:usable_len].reshape(target_samples, ratio)
    
    max_vals = reshaped.max(axis=1)
    min_vals = reshaped.min(axis=1)
    
    result = np.empty(target_samples * 2, dtype=np.float32)
    result[0::2] = max_vals
    result[1::2] = min_vals
    
    return result.tolist()

def get_waveform_region(pcm_data, start_time, end_time, sample_rate, target_pixels=1200):
    total_samples = len(pcm_data)
    
    start_sample = int(start_time * sample_rate)
    end_sample = int(end_time * sample_rate)
    
    start_sample = max(0, min(total_samples - 1, start_sample))
    end_sample = max(start_sample + 1, min(total_samples, end_sample))
    
    region_data = pcm_data[start_sample:end_sample]
    region_samples = len(region_data)
    
    if region_samples <= target_pixels * 2:
        result = np.empty(region_samples * 2, dtype=np.float32)
        result[0::2] = region_data
        result[1::2] = region_data
        return {
            'waveform': result.tolist(),
            'start_time': start_sample / sample_rate,
            'end_time': end_sample / sample_rate,
            'samples': region_samples
        }
    
    ratio = region_samples // target_pixels
    usable_len = target_pixels * ratio
    reshaped = region_data[:usable_len].reshape(target_pixels, ratio)
    
    max_vals = reshaped.max(axis=1)
    min_vals = reshaped.min(axis=1)
    
    result = np.empty(target_pixels * 2, dtype=np.float32)
    result[0::2] = max_vals
    result[1::2] = min_vals
    
    return {
        'waveform': result.tolist(),
        'start_time': start_sample / sample_rate,
        'end_time': end_sample / sample_rate,
        'samples': region_samples
    }

def mp3_to_pcm(file_path):
    audio = AudioSegment.from_mp3(file_path)
    audio = audio.set_channels(1)
    samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
    max_amp = np.max(np.abs(samples))
    if max_amp > 0:
        samples = samples / max_amp
    return samples, audio.frame_rate, len(audio)

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    target_samples = int(request.form.get('target_samples', 10000))
    
    if file and allowed_file(file.filename):
        file_path = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(file_path)
        
        try:
            pcm_data, sample_rate, duration_ms = mp3_to_pcm(file_path)
            
            with open(file_path, 'rb') as f:
                raw_mp3_bytes = f.read()
            
            file_hash = hashlib.md5(raw_mp3_bytes).hexdigest()
            AUDIO_CACHE[file_hash] = {
                'pcm_data': pcm_data,
                'sample_rate': sample_rate,
                'duration': duration_ms / 1000,
                'filename': file.filename,
                'raw_mp3': raw_mp3_bytes
            }
            
            if len(AUDIO_CACHE) > 5:
                old_key = next(iter(AUDIO_CACHE))
                del AUDIO_CACHE[old_key]
            
            waveform_data = downsample_fast(pcm_data, target_samples)
            
            os.remove(file_path)
            
            return jsonify({
                'waveform': waveform_data,
                'sample_rate': sample_rate,
                'duration': duration_ms / 1000,
                'filename': file.filename,
                'file_hash': file_hash,
                'total_samples': len(pcm_data)
            })
        except Exception as e:
            if os.path.exists(file_path):
                os.remove(file_path)
            return jsonify({'error': str(e)}), 500
    
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/waveform', methods=['GET'])
def get_waveform():
    file_hash = request.args.get('file_hash')
    start_time = float(request.args.get('start', 0))
    end_time = float(request.args.get('end', 0))
    target_pixels = int(request.args.get('pixels', 1200))
    
    if not file_hash or file_hash not in AUDIO_CACHE:
        return jsonify({'error': 'Audio not found, please re-upload'}), 404
    
    audio = AUDIO_CACHE[file_hash]
    
    if end_time <= start_time:
        end_time = audio['duration']
    
    result = get_waveform_region(
        audio['pcm_data'],
        start_time,
        end_time,
        audio['sample_rate'],
        target_pixels
    )
    
    return jsonify(result)

@app.route('/audio/<file_hash>')
def serve_audio(file_hash):
    if file_hash not in AUDIO_CACHE:
        return jsonify({'error': 'Audio not found'}), 404
    
    audio = AUDIO_CACHE[file_hash]
    raw_bytes = audio['raw_mp3']
    
    range_header = request.headers.get('Range')
    
    if range_header:
        unit, ranges = range_header.split('=')
        if unit.strip() == 'bytes':
            parts = ranges.split('-')
            start = int(parts[0]) if parts[0] else 0
            end = int(parts[1]) if len(parts) > 1 and parts[1] else len(raw_bytes) - 1
            
            end = min(end, len(raw_bytes) - 1)
            chunk = raw_bytes[start:end + 1]
            
            resp = Response(chunk, 206, mimetype='audio/mpeg')
            resp.headers['Content-Range'] = f'bytes {start}-{end}/{len(raw_bytes)}'
            resp.headers['Content-Length'] = len(chunk)
            resp.headers['Accept-Ranges'] = 'bytes'
            return resp
    
    return send_file(
        BytesIO(raw_bytes),
        mimetype='audio/mpeg',
        as_attachment=False,
        download_name=audio.get('filename', 'audio.mp3')
    )

if __name__ == '__main__':
    app.run(debug=True, port=5000)
