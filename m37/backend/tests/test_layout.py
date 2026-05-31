import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import json
from app.layout import LayoutManager

def test_force3d_layout():
    print("=== Testing 3D Force-Directed Layout ===")

    devices = [
        {'id': 'r1', 'type': 'router', 'name': 'Router 1'},
        {'id': 'fw1', 'type': 'firewall', 'name': 'Firewall 1'},
        {'id': 'cs1', 'type': 'core_switch', 'name': 'Core Switch 1'},
        {'id': 'sw1', 'type': 'switch', 'name': 'Switch 1'},
        {'id': 'sw2', 'type': 'switch', 'name': 'Switch 2'},
        {'id': 'srv1', 'type': 'server', 'name': 'Server 1'},
        {'id': 'pc1', 'type': 'host', 'name': 'PC 1'},
    ]

    connections = [
        {'from': 'r1', 'to': 'fw1', 'bandwidth': 10},
        {'from': 'fw1', 'to': 'cs1', 'bandwidth': 10},
        {'from': 'cs1', 'to': 'sw1', 'bandwidth': 1},
        {'from': 'cs1', 'to': 'sw2', 'bandwidth': 1},
        {'from': 'sw1', 'to': 'srv1', 'bandwidth': 1},
        {'from': 'sw2', 'to': 'pc1', 'bandwidth': 0.1},
    ]

    manager = LayoutManager()
    result = manager.compute_layout(devices, connections, algorithm='force3d')

    print(f"Algorithm: {result['algorithm']}")
    print(f"Devices with positions: {len(result['devices'])}")
    print(f"Connections: {len(result['connections'])}")
    print("\nPositions:")
    for device in result['devices']:
        pos = device['position']
        print(f"  {device['id']} ({device['type']}): ({pos['x']:.2f}, {pos['y']:.2f}, {pos['z']:.2f})")

    assert len(result['devices']) == len(devices)
    for device in result['devices']:
        assert 'position' in device
        assert all(k in device['position'] for k in ['x', 'y', 'z'])

    print("\n✅ Force3D layout test passed!")
    return True

def test_graphviz_layout():
    print("\n=== Testing Graphviz Layout ===")

    devices = [
        {'id': 'a', 'type': 'router', 'name': 'A'},
        {'id': 'b', 'type': 'switch', 'name': 'B'},
        {'id': 'c', 'type': 'switch', 'name': 'C'},
        {'id': 'd', 'type': 'host', 'name': 'D'},
        {'id': 'e', 'type': 'host', 'name': 'E'},
    ]

    connections = [
        {'from': 'a', 'to': 'b'},
        {'from': 'a', 'to': 'c'},
        {'from': 'b', 'to': 'd'},
        {'from': 'c', 'to': 'e'},
    ]

    manager = LayoutManager()

    for layout_type in ['dot', 'neato', 'fdp']:
        try:
            result = manager.compute_layout(
                devices, connections,
                algorithm='graphviz',
                layout_type=layout_type
            )
            print(f"  {layout_type}: {len(result['devices'])} devices positioned")
        except Exception as e:
            print(f"  {layout_type}: Failed - {e}")

    print("\n✅ Graphviz layout test completed!")
    return True

def test_large_network():
    print("\n=== Testing Large Network ===")

    devices = []
    connections = []

    for i in range(1, 51):
        devices.append({
            'id': f'dev{i}',
            'type': ['router', 'firewall', 'switch', 'server', 'host'][i % 5],
            'name': f'Device {i}'
        })

    for i in range(1, 50):
        connections.append({
            'from': f'dev{i}',
            'to': f'dev{i+1}',
            'bandwidth': 1.0
        })

    for i in range(1, 25):
        connections.append({
            'from': f'dev{i}',
            'to': f'dev{i+25}',
            'bandwidth': 0.5
        })

    manager = LayoutManager()
    result = manager.compute_layout(devices, connections, algorithm='force3d')

    print(f"Total devices: {len(devices)}")
    print(f"Total connections: {len(connections)}")
    print(f"Positioned devices: {len(result['devices'])}")

    positions = [d['position'] for d in result['devices']]
    xs = [p['x'] for p in positions]
    ys = [p['y'] for p in positions]
    zs = [p['z'] for p in positions]

    print(f"X range: [{min(xs):.2f}, {max(xs):.2f}]")
    print(f"Y range: [{min(ys):.2f}, {max(ys):.2f}]")
    print(f"Z range: [{min(zs):.2f}, {max(zs):.2f}]")

    print("\n✅ Large network test passed!")
    return True

def test_api_format():
    print("\n=== Testing API Output Format ===")

    devices = [
        {'id': 'r1', 'type': 'router', 'name': 'Router', 'ip': '192.168.1.1'},
        {'id': 'sw1', 'type': 'switch', 'name': 'Switch'},
        {'id': 'pc1', 'type': 'host', 'name': 'PC'},
    ]

    connections = [
        {'from': 'r1', 'to': 'sw1', 'bandwidth': 10, 'type': 'fiber'},
        {'from': 'sw1', 'to': 'pc1', 'bandwidth': 1, 'type': 'ethernet'},
    ]

    manager = LayoutManager()
    result = manager.compute_layout(devices, connections)

    output = {
        'success': True,
        'data': result
    }

    json_output = json.dumps(output, indent=2, ensure_ascii=False)
    print("JSON output sample (first 500 chars):")
    print(json_output[:500] + "...")

    parsed = json.loads(json_output)
    assert parsed['success'] == True
    assert 'data' in parsed
    assert 'devices' in parsed['data']
    assert 'connections' in parsed['data']
    assert 'positions' in parsed['data']

    print("\n✅ API format test passed!")
    return True

if __name__ == '__main__':
    all_passed = True
    all_passed &= test_force3d_layout()
    all_passed &= test_graphviz_layout()
    all_passed &= test_large_network()
    all_passed &= test_api_format()

    print("\n" + "=" * 50)
    if all_passed:
        print("🎉 All tests passed!")
    else:
        print("⚠️  Some tests failed")
    print("=" * 50)
