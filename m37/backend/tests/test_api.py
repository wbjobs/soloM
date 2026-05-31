import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import json
from app import create_app

def test_health_endpoint():
    print("=== Testing /api/health ===")
    app = create_app()
    client = app.test_client()

    response = client.get('/api/health')
    assert response.status_code == 200

    data = response.get_json()
    assert 'status' in data
    assert data['status'] == 'healthy'
    assert 'service' in data
    assert 'version' in data

    print(f"  Response: {json.dumps(data, indent=2)}")
    print("✅ Health endpoint test passed!")
    return True

def test_algorithms_endpoint():
    print("\n=== Testing /api/algorithms ===")
    app = create_app()
    client = app.test_client()

    response = client.get('/api/algorithms')
    assert response.status_code == 200

    data = response.get_json()
    assert 'algorithms' in data
    assert len(data['algorithms']) >= 2

    algo_ids = [a['id'] for a in data['algorithms']]
    assert 'force3d' in algo_ids
    assert 'graphviz' in algo_ids

    print(f"  Found {len(data['algorithms'])} algorithms: {algo_ids}")
    print("✅ Algorithms endpoint test passed!")
    return True

def test_device_types_endpoint():
    print("\n=== Testing /api/device-types ===")
    app = create_app()
    client = app.test_client()

    response = client.get('/api/device-types')
    assert response.status_code == 200

    data = response.get_json()
    assert 'device_types' in data
    assert len(data['device_types']) >= 5

    types = [dt['type'] for dt in data['device_types']]
    assert 'router' in types
    assert 'firewall' in types
    assert 'switch' in types
    assert 'server' in types

    print(f"  Found {len(data['device_types'])} device types: {types}")
    print("✅ Device types endpoint test passed!")
    return True

def test_sample_endpoint():
    print("\n=== Testing /api/sample ===")
    app = create_app()
    client = app.test_client()

    for sample_type in ['small', 'medium', 'large']:
        response = client.get(f'/api/sample?type={sample_type}')
        assert response.status_code == 200

        data = response.get_json()
        assert 'devices' in data
        assert 'connections' in data
        assert len(data['devices']) > 0
        assert len(data['connections']) > 0

        print(f"  {sample_type}: {len(data['devices'])} devices, {len(data['connections'])} connections")

    print("✅ Sample endpoint test passed!")
    return True

def test_generate_endpoint():
    print("\n=== Testing /api/generate ===")
    app = create_app()
    client = app.test_client()

    topology_data = {
        'name': 'Test Topology',
        'devices': [
            {'id': 'r1', 'type': 'router', 'name': 'Router 1', 'ip': '192.168.1.1'},
            {'id': 'sw1', 'type': 'switch', 'name': 'Switch 1'},
            {'id': 'srv1', 'type': 'server', 'name': 'Server 1', 'ip': '192.168.2.10'},
            {'id': 'pc1', 'type': 'host', 'name': 'PC 1', 'ip': '192.168.3.10'},
        ],
        'connections': [
            {'from': 'r1', 'to': 'sw1', 'bandwidth': 10, 'type': 'fiber'},
            {'from': 'sw1', 'to': 'srv1', 'bandwidth': 1, 'type': 'ethernet'},
            {'from': 'sw1', 'to': 'pc1', 'bandwidth': 0.1, 'type': 'ethernet'},
        ],
        'algorithm': 'force3d'
    }

    response = client.post(
        '/api/generate',
        json=topology_data,
        content_type='application/json'
    )

    assert response.status_code == 200

    data = response.get_json()
    assert data['success'] == True
    assert 'data' in data
    assert 'devices' in data['data']
    assert 'connections' in data['data']
    assert 'positions' in data['data']

    for device in data['data']['devices']:
        assert 'position' in device
        pos = device['position']
        assert all(k in pos for k in ['x', 'y', 'z'])
        assert isinstance(pos['x'], (int, float))

    print(f"  Generated topology with {len(data['data']['devices'])} devices")
    print("✅ Generate endpoint test passed!")
    return True

def test_generate_validation():
    print("\n=== Testing /api/generate validation ===")
    app = create_app()
    client = app.test_client()

    invalid_data = {
        'devices': [
            {'id': 'r1', 'type': 'invalid_type', 'name': 'Router'},
        ],
        'connections': [
            {'from': 'r1', 'to': 'non_existent'},
        ]
    }

    response = client.post(
        '/api/generate',
        json=invalid_data,
        content_type='application/json'
    )

    assert response.status_code == 400

    data = response.get_json()
    assert 'error' in data
    assert 'details' in data
    assert len(data['details']) > 0

    print(f"  Validation errors: {len(data['details'])}")
    for error in data['details']:
        print(f"    - {error}")

    print("✅ Validation test passed!")
    return True

def test_empty_body():
    print("\n=== Testing empty request body ===")
    app = create_app()
    client = app.test_client()

    response = client.post('/api/generate', data='', content_type='application/json')
    assert response.status_code == 400

    data = response.get_json()
    assert 'error' in data

    print(f"  Error: {data['error']}")
    print("✅ Empty body test passed!")
    return True

if __name__ == '__main__':
    all_passed = True
    all_passed &= test_health_endpoint()
    all_passed &= test_algorithms_endpoint()
    all_passed &= test_device_types_endpoint()
    all_passed &= test_sample_endpoint()
    all_passed &= test_generate_endpoint()
    all_passed &= test_generate_validation()
    all_passed &= test_empty_body()

    print("\n" + "=" * 50)
    if all_passed:
        print("🎉 All API tests passed!")
    else:
        print("⚠️  Some API tests failed")
    print("=" * 50)
