from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import re

app = FastAPI(title="分子结构可视化API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ATOMIC_WEIGHTS = {
    'H': 1.008, 'HE': 4.003, 'LI': 6.941, 'BE': 9.012, 'B': 10.811,
    'C': 12.011, 'N': 14.007, 'O': 15.999, 'F': 18.998, 'NE': 20.180,
    'NA': 22.990, 'MG': 24.305, 'AL': 26.982, 'SI': 28.086, 'P': 30.974,
    'S': 32.065, 'CL': 35.453, 'AR': 39.948, 'K': 39.098, 'CA': 40.078,
    'SC': 44.956, 'TI': 47.867, 'V': 50.942, 'CR': 51.996, 'MN': 54.938,
    'FE': 55.845, 'CO': 58.933, 'NI': 58.693, 'CU': 63.546, 'ZN': 65.38,
    'GA': 69.723, 'GE': 72.64, 'AS': 74.922, 'SE': 78.96, 'BR': 79.904,
    'KR': 83.798, 'RB': 85.468, 'SR': 87.62, 'Y': 88.906, 'ZR': 91.224,
    'NB': 92.906, 'MO': 95.96, 'TC': 98.0, 'RU': 101.07, 'RH': 102.906,
    'PD': 106.42, 'AG': 107.868, 'CD': 112.411, 'IN': 114.818, 'SN': 118.710,
    'SB': 121.760, 'TE': 127.60, 'I': 126.904, 'XE': 131.293, 'CS': 132.905,
    'BA': 137.327, 'LA': 138.905, 'CE': 140.116, 'PR': 140.908, 'ND': 144.242,
    'PM': 145.0, 'SM': 150.36, 'EU': 151.964, 'GD': 157.25, 'TB': 158.925,
    'DY': 162.500, 'HO': 164.930, 'ER': 167.259, 'TM': 168.934, 'YB': 173.054,
    'LU': 174.967, 'HF': 178.49, 'TA': 180.948, 'W': 183.84, 'RE': 186.207,
    'OS': 190.23, 'IR': 192.217, 'PT': 195.084, 'AU': 196.967, 'HG': 200.59,
    'TL': 204.383, 'PB': 207.2, 'BI': 208.980, 'PO': 209.0, 'AT': 210.0,
    'RN': 222.0, 'FR': 223.0, 'RA': 226.0, 'AC': 227.0, 'TH': 232.038,
    'PA': 231.036, 'U': 238.029, 'NP': 237.0, 'PU': 244.0, 'AM': 243.0,
    'CM': 247.0, 'BK': 247.0, 'CF': 251.0, 'ES': 252.0, 'FM': 257.0,
    'MD': 258.0, 'NO': 259.0, 'LR': 262.0, 'RF': 267.0, 'DB': 268.0,
    'SG': 269.0, 'BH': 270.0, 'HS': 277.0, 'MT': 276.0, 'DS': 281.0,
    'RG': 280.0, 'CN': 285.0, 'UUT': 284.0, 'FL': 289.0, 'UUP': 288.0,
    'LV': 292.0, 'UUS': 291.0, 'UUO': 294.0
}

ATOM_COLORS = {
    'H': 0xFFFFFF, 'C': 0x333333, 'N': 0x0000FF, 'O': 0xFF0000,
    'F': 0x00FF00, 'CL': 0x00FF00, 'BR': 0x8B0000, 'I': 0x940094,
    'P': 0xFF8000, 'S': 0xFFFF00, 'B': 0xFFA500, 'LI': 0xFF6666,
    'NA': 0xFF6666, 'K': 0xFF6666, 'MG': 0x00FF00, 'CA': 0x808080,
    'FE': 0xFFA500, 'ZN': 0x808080, 'CU': 0x8B4513, 'NI': 0x808080,
    'MN': 0xFFA500, 'AL': 0x808080, 'SI': 0x808080, 'AU': 0xFFD700,
    'default': 0xFFC0CB
}

class AtomSelection(BaseModel):
    atom_ids: List[int]
    atoms_data: List[Dict]

class MassResult(BaseModel):
    selected_count: int
    total_mass: float
    average_mass: float
    atom_details: List[Dict]

def get_atomic_weight(element: str) -> float:
    element_upper = element.strip().upper()
    return ATOMIC_WEIGHTS.get(element_upper, 12.011)

def get_atom_color(element: str) -> int:
    element_upper = element.strip().upper()
    return ATOM_COLORS.get(element_upper, ATOM_COLORS['default'])

def parse_pdb_content(content: str) -> Dict:
    atoms = []
    bonds = []
    lines = content.split('\n')
    
    atom_serial_to_index = {}
    
    for idx, line in enumerate(lines):
        record_type = line[0:6].strip()
        
        if record_type == 'ATOM' or record_type == 'HETATM':
            try:
                serial = int(line[6:11].strip())
                name = line[12:16].strip()
                alt_loc = line[16:17].strip()
                res_name = line[17:20].strip()
                chain_id = line[21:22].strip()
                res_seq = int(line[22:26].strip())
                i_code = line[26:27].strip()
                x = float(line[30:38].strip())
                y = float(line[38:46].strip())
                z = float(line[46:54].strip())
                occupancy = float(line[54:60].strip()) if line[54:60].strip() else 1.0
                temp_factor = float(line[60:66].strip()) if line[60:66].strip() else 0.0
                
                element = ''
                if len(line) >= 78:
                    element = line[76:78].strip()
                if not element:
                    element = re.sub(r'[^a-zA-Z]', '', name)[0:1] if name else 'C'
                
                atom_index = len(atoms)
                atom_serial_to_index[serial] = atom_index
                
                atoms.append({
                    'id': atom_index,
                    'serial': serial,
                    'name': name,
                    'element': element,
                    'res_name': res_name,
                    'chain_id': chain_id,
                    'res_seq': res_seq,
                    'x': x,
                    'y': y,
                    'z': z,
                    'occupancy': occupancy,
                    'temp_factor': temp_factor,
                    'color': get_atom_color(element),
                    'mass': get_atomic_weight(element)
                })
            except Exception as e:
                continue
        
        elif record_type == 'CONECT':
            try:
                parts = line.split()
                if len(parts) >= 2:
                    atom_serial = int(parts[1])
                    for i in range(2, len(parts)):
                        bonded_serial = int(parts[i])
                        bonds.append({
                            'atom1': atom_serial,
                            'atom2': bonded_serial
                        })
            except Exception as e:
                continue
    
    if not bonds and len(atoms) > 1:
        bond_threshold = 1.8
        for i in range(len(atoms)):
            for j in range(i + 1, len(atoms)):
                dx = atoms[i]['x'] - atoms[j]['x']
                dy = atoms[i]['y'] - atoms[j]['y']
                dz = atoms[i]['z'] - atoms[j]['z']
                distance = (dx**2 + dy**2 + dz**2)**0.5
                if distance < bond_threshold:
                    bonds.append({
                        'atom1': atoms[i]['serial'],
                        'atom2': atoms[j]['serial']
                    })
    
    bonds_indexed = []
    for bond in bonds:
        idx1 = atom_serial_to_index.get(bond['atom1'])
        idx2 = atom_serial_to_index.get(bond['atom2'])
        if idx1 is not None and idx2 is not None:
            bonds_indexed.append({
                'atom1': idx1,
                'atom2': idx2
            })
    
    return {
        'atoms': atoms,
        'bonds': bonds_indexed,
        'atom_count': len(atoms),
        'bond_count': len(bonds_indexed)
    }

@app.post("/api/calculate-mass", response_model=MassResult)
async def calculate_average_mass(selection: AtomSelection):
    if not selection.atom_ids:
        raise HTTPException(
            status_code=400,
            detail="atom_ids 列表不能为空，请至少选择一个原子"
        )

    try:
        selected_atoms = []
        total_mass = 0.0

        atom_data_map = {}
        for atom in selection.atoms_data:
            try:
                atom_data_map[atom['id']] = atom
            except (KeyError, TypeError):
                continue

        for atom_id in selection.atom_ids:
            if atom_id in atom_data_map:
                atom = atom_data_map[atom_id]
                try:
                    mass = get_atomic_weight(atom['element'])
                except (KeyError, TypeError):
                    mass = 12.011
                total_mass += mass
                selected_atoms.append({
                    'id': atom_id,
                    'element': atom.get('element', 'C'),
                    'name': atom.get('name', ''),
                    'mass': mass
                })

        count = len(selected_atoms)
        if count == 0:
            raise HTTPException(
                status_code=400,
                detail="选中的原子ID在原子数据中未找到，请检查选择"
            )

        average_mass = total_mass / count

        return MassResult(
            selected_count=count,
            total_mass=round(total_mass, 4),
            average_mass=round(average_mass, 4),
            atom_details=selected_atoms
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"计算过程中发生错误: {str(e)}"
        )

@app.get("/api/atomic-weights")
async def get_atomic_weights():
    return ATOMIC_WEIGHTS

@app.get("/api/atom-colors")
async def get_atom_colors():
    return ATOM_COLORS

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
