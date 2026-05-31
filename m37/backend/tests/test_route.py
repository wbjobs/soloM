import sys
sys.path.insert(0, '.')
from app import create_app

app = create_app()
client = app.test_client()

print('=== Test 1: Get medium network sample ===')
resp = client.get('/api/sample?type=medium')
sample = resp.get_json()
print(f'  Devices: {len(sample["devices"])}')
print(f'  Connections: {len(sample["connections"])}')

hosts = [d for d in sample['devices'] if d.get('ip') and d['type'] in ['host', 'server', 'client']]
print(f'  Available hosts: {len(hosts)}')

if len(hosts) >= 2:
    src_ip = hosts[0]['ip']
    dst_ip = hosts[-1]['ip']
    print(f'  Test route: {src_ip} -> {dst_ip}')

    print('\n=== Test 2: Compute route ===')
    payload = {
        'devices': sample['devices'],
        'connections': sample['connections'],
        'source_ip': src_ip,
        'dest_ip': dst_ip
    }
    resp = client.post('/api/route', json=payload)
    print(f'  Status: {resp.status_code}')

    result = resp.get_json()
    if result.get('success') and result.get('data'):
        data = result['data']
        print(f'  Success: {data["success"]}')
        path_names = ' -> '.join([d.get('name') or d['id'] for d in data['path_devices']])
        print(f'  Path: {path_names}')
        print(f'  Hops: {data["total_hops"]}')
        print(f'  Edges: {len(data["edges"])}')

        print('\n=== Test 3: Invalid IP ===')
        payload['dest_ip'] = '999.999.999.999'
        resp = client.post('/api/route', json=payload)
        print(f'  Status: {resp.status_code}')
        err = resp.get_json()
        err_msg = err.get('error') or err.get('data', {}).get('error')
        print(f'  Error: {err_msg}')

print('\n=== All tests passed! ===')
