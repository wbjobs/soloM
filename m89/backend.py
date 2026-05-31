from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
import os

app = Flask(__name__, static_folder='.')
CORS(app)

def parse_pdb(file_path):
    atoms = []
    with open(file_path, 'r') as f:
        for line in f:
            if line.startswith('ATOM') or line.startswith('HETATM'):
                atom = {
                    'name': line[12:16].strip(),
                    'element': line[76:78].strip() if len(line) > 78 else line[12:14].strip(),
                    'x': float(line[30:38]),
                    'y': float(line[38:46]),
                    'z': float(line[46:54]),
                    'residue_name': line[17:20].strip(),
                    'residue_num': int(line[22:26].strip()) if line[22:26].strip() else 0,
                    'chain_id': line[21:22].strip()
                }
                atoms.append(atom)
    return atoms

@app.route('/api/atoms')
def get_atoms():
    pdb_file = request.args.get('file', 'structure.pdb')
    if pdb_file == 'large':
        pdb_file = 'large_structure.pdb'
    
    pdb_path = os.path.join(os.path.dirname(__file__), pdb_file)
    
    if not os.path.exists(pdb_path):
        pdb_path = os.path.join(os.path.dirname(__file__), 'structure.pdb')
    
    atoms = parse_pdb(pdb_path)
    response = jsonify(atoms)
    return response

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
