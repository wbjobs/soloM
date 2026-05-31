import random
import math

def generate_large_pdb(num_atoms=6000, filename='large_structure.pdb'):
    elements = ['C', 'O', 'N', 'H', 'S', 'P']
    atom_names = {
        'C': ['CA', 'CB', 'CG', 'CD', 'CE', 'CZ'],
        'O': ['O', 'OG', 'OD1', 'OD2', 'OE1', 'OE2'],
        'N': ['N', 'NH1', 'NH2', 'NZ', 'ND1', 'NE2'],
        'H': ['H', 'HA', 'HB', 'HG', 'HH'],
        'S': ['SG', 'SD'],
        'P': ['P']
    }
    
    with open(filename, 'w') as f:
        f.write('HEADER    LARGE PROTEIN STRUCTURE\n')
        f.write('TITLE     Generated Test Structure\n')
        f.write(f'CRYST1  100.000  100.000  100.000  90.00  90.00  90.00 P 1\n')
        
        for i in range(1, num_atoms + 1):
            element = random.choice(elements)
            atom_name = random.choice(atom_names[element])
            
            angle1 = random.uniform(0, 2 * math.pi)
            angle2 = random.uniform(0, 2 * math.pi)
            radius = random.uniform(5, 40)
            
            x = radius * math.sin(angle1) * math.cos(angle2)
            y = radius * math.sin(angle1) * math.sin(angle2)
            z = radius * math.cos(angle1)
            
            f.write(f'ATOM  {i:5d} {atom_name:<4s} ALA A   1    {x:8.3f}{y:8.3f}{z:8.3f}  1.00  0.00          {element:>2s}\n')
        
        f.write('END\n')
    
    print(f'生成了包含 {num_atoms} 个原子的 PDB 文件: {filename}')

if __name__ == '__main__':
    generate_large_pdb(6000)
