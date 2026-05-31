from flask import Flask, jsonify, request
from flask_cors import CORS
import os
from data_processor import process_sankey_data

app = Flask(__name__)
CORS(app)

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
DEFAULT_CSV = os.path.join(DATA_DIR, 'user_behavior_logs.csv')

processor_instance = None
current_filters = {'file': None, 'start_date': None, 'end_date': None}

def get_or_process_data(csv_path=None, start_date=None, end_date=None):
    global processor_instance, current_filters
    target_csv = csv_path or DEFAULT_CSV
    
    if not os.path.exists(target_csv):
        return None, f"CSV file not found: {target_csv}"
    
    sankey_data, processor = process_sankey_data(target_csv, start_date, end_date)
    processor_instance = processor
    current_filters = {
        'file': csv_path,
        'start_date': start_date,
        'end_date': end_date
    }
    return sankey_data, None

@app.route('/api/sankey-data', methods=['GET'])
def get_sankey_data():
    csv_file = request.args.get('file')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    if csv_file:
        csv_path = os.path.join(DATA_DIR, csv_file)
    else:
        csv_path = DEFAULT_CSV
    
    data, error = get_or_process_data(csv_path, start_date, end_date)
    if error:
        return jsonify({'error': error}), 404
    
    return jsonify(data)

@app.route('/api/node-details', methods=['GET'])
def get_node_details():
    node_name = request.args.get('name')
    if not node_name:
        return jsonify({'error': 'Node name parameter is required'}), 400
    
    if processor_instance is None:
        get_or_process_data()
    
    if processor_instance is None:
        return jsonify({'error': 'Data not processed yet'}), 500
    
    details = processor_instance.get_node_details(node_name)
    if details is None:
        return jsonify({'error': f'Node not found: {node_name}'}), 404
    
    return jsonify(details)

@app.route('/api/available-files', methods=['GET'])
def get_available_files():
    if not os.path.exists(DATA_DIR):
        return jsonify({'files': []})
    
    files = [f for f in os.listdir(DATA_DIR) if f.endswith('.csv')]
    return jsonify({'files': files})

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'data_dir': DATA_DIR})

if __name__ == '__main__':
    print(f"Starting Sankey Analysis Backend...")
    print(f"Data directory: {DATA_DIR}")
    print(f"Default CSV: {DEFAULT_CSV}")
    app.run(host='0.0.0.0', port=5000, debug=True)
