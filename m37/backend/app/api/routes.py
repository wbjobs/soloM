from flask import Blueprint, request, jsonify
from typing import Dict, Any, List

from app.layout import LayoutManager, RouteCalculator
from app.validators import validate_topology_data

topology_bp = Blueprint('topology', __name__)

layout_manager = LayoutManager()
route_calculator = RouteCalculator()


@topology_bp.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'service': 'network-topology-generator',
        'version': '1.0.0'
    })


@topology_bp.route('/algorithms', methods=['GET'])
def get_algorithms():
    algorithms = [
        {
            'id': 'force3d',
            'name': '3D Force-Directed',
            'description': 'Custom 3D force-directed layout algorithm with layer-based Z-axis ordering',
            'supported': True
        }
    ]

    try:
        from app.layout.graphviz_layout import GraphvizLayout
        algorithms.append({
            'id': 'graphviz',
            'name': 'Graphviz (2D -> 3D)',
            'description': 'Graphviz layout algorithms (dot, neato, fdp, sfdp, twopi, circo) with Z-axis extension',
            'supported': True,
            'subtypes': ['dot', 'neato', 'fdp', 'sfdp', 'twopi', 'circo']
        })
    except ImportError:
        algorithms.append({
            'id': 'graphviz',
            'name': 'Graphviz (2D -> 3D)',
            'description': 'Requires networkx, pydot, and system Graphviz installation',
            'supported': False
        })

    return jsonify({'algorithms': algorithms})


@topology_bp.route('/device-types', methods=['GET'])
def get_device_types():
    return jsonify({
        'device_types': [
            {'type': 'router', 'name': 'Router', 'color': '#4CAF50', 'priority': 3},
            {'type': 'firewall', 'name': 'Firewall', 'color': '#F44336', 'priority': 2.5},
            {'type': 'core_switch', 'name': 'Core Switch', 'color': '#9C27B0', 'priority': 2},
            {'type': 'switch', 'name': 'Switch', 'color': '#2196F3', 'priority': 1},
            {'type': 'server', 'name': 'Server', 'color': '#FF9800', 'priority': 0},
            {'type': 'host', 'name': 'Host', 'color': '#607D8B', 'priority': 0},
            {'type': 'client', 'name': 'Client', 'color': '#795548', 'priority': 0}
        ]
    })


@topology_bp.route('/generate', methods=['POST'])
def generate_topology():
    try:
        try:
            data = request.get_json(silent=False)
        except Exception:
            return jsonify({'error': 'Invalid JSON format'}), 400

        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        is_valid, errors = validate_topology_data(data)
        if not is_valid:
            return jsonify({'error': 'Invalid topology data', 'details': errors}), 400

        devices = data.get('devices', [])
        connections = data.get('connections', [])
        algorithm = data.get('algorithm', 'force3d')
        options = data.get('options', {})

        result = layout_manager.compute_layout(
            devices=devices,
            connections=connections,
            algorithm=algorithm,
            **options
        )

        return jsonify({
            'success': True,
            'data': result
        })

    except Exception as e:
        return jsonify({
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@topology_bp.route('/sample', methods=['GET'])
def get_sample_data():
    sample_type = request.args.get('type', 'small')

    if sample_type == 'large':
        sample_data = get_large_sample()
    elif sample_type == 'medium':
        sample_data = get_medium_sample()
    else:
        sample_data = get_small_sample()

    return jsonify(sample_data)


def get_small_sample() -> Dict[str, Any]:
    return {
        'name': 'Small Enterprise Network',
        'description': 'A simple small business network topology',
        'devices': [
            {'id': 'r1', 'type': 'router', 'name': 'Edge Router', 'ip': '192.168.1.1', 'model': 'Cisco ISR 4331'},
            {'id': 'fw1', 'type': 'firewall', 'name': 'Main Firewall', 'ip': '192.168.1.2', 'model': 'Palo Alto PA-220'},
            {'id': 'cs1', 'type': 'core_switch', 'name': 'Core Switch', 'ip': '192.168.1.3', 'model': 'Cisco Catalyst 9500'},
            {'id': 'sw1', 'type': 'switch', 'name': 'Access Switch 1', 'ip': '192.168.2.1', 'model': 'Cisco Catalyst 2960'},
            {'id': 'sw2', 'type': 'switch', 'name': 'Access Switch 2', 'ip': '192.168.3.1', 'model': 'Cisco Catalyst 2960'},
            {'id': 'srv1', 'type': 'server', 'name': 'Web Server', 'ip': '192.168.2.10', 'os': 'Ubuntu 22.04'},
            {'id': 'srv2', 'type': 'server', 'name': 'DB Server', 'ip': '192.168.2.11', 'os': 'CentOS 8'},
            {'id': 'pc1', 'type': 'host', 'name': 'User PC 1', 'ip': '192.168.3.10', 'os': 'Windows 11'},
            {'id': 'pc2', 'type': 'host', 'name': 'User PC 2', 'ip': '192.168.3.11', 'os': 'Windows 10'}
        ],
        'connections': [
            {'from': 'r1', 'to': 'fw1', 'bandwidth': 10, 'type': 'fiber'},
            {'from': 'fw1', 'to': 'cs1', 'bandwidth': 10, 'type': 'fiber'},
            {'from': 'cs1', 'to': 'sw1', 'bandwidth': 1, 'type': 'ethernet'},
            {'from': 'cs1', 'to': 'sw2', 'bandwidth': 1, 'type': 'ethernet'},
            {'from': 'sw1', 'to': 'srv1', 'bandwidth': 1, 'type': 'ethernet'},
            {'from': 'sw1', 'to': 'srv2', 'bandwidth': 1, 'type': 'ethernet'},
            {'from': 'sw2', 'to': 'pc1', 'bandwidth': 0.1, 'type': 'ethernet'},
            {'from': 'sw2', 'to': 'pc2', 'bandwidth': 0.1, 'type': 'ethernet'}
        ]
    }


def get_medium_sample() -> Dict[str, Any]:
    devices: List[Dict[str, Any]] = [
        {'id': 'r1', 'type': 'router', 'name': 'Edge Router 1', 'ip': '10.0.0.1', 'model': 'Cisco ASR 1001'},
        {'id': 'r2', 'type': 'router', 'name': 'Edge Router 2', 'ip': '10.0.0.2', 'model': 'Cisco ASR 1001'},
        {'id': 'fw1', 'type': 'firewall', 'name': 'Primary Firewall', 'ip': '10.0.1.1', 'model': 'Palo Alto PA-8500'},
        {'id': 'fw2', 'type': 'firewall', 'name': 'Secondary Firewall', 'ip': '10.0.1.2', 'model': 'Palo Alto PA-8500'},
        {'id': 'cs1', 'type': 'core_switch', 'name': 'Core Switch A', 'ip': '10.0.2.1', 'model': 'Cisco Nexus 9000'},
        {'id': 'cs2', 'type': 'core_switch', 'name': 'Core Switch B', 'ip': '10.0.2.2', 'model': 'Cisco Nexus 9000'},
    ]

    for i in range(1, 6):
        devices.append({
            'id': f'dc{i}',
            'type': 'switch',
            'name': f'Distribution Switch {i}',
            'ip': f'10.1.{i}.1',
            'model': 'Cisco Catalyst 9300'
        })

    for i in range(1, 11):
        devices.append({
            'id': f'as{i}',
            'type': 'switch',
            'name': f'Access Switch {i}',
            'ip': f'10.2.{i}.1',
            'model': 'Cisco Catalyst 2960X'
        })

    for i in range(1, 11):
        devices.append({
            'id': f'srv{i}',
            'type': 'server',
            'name': f'Server {i}',
            'ip': f'10.3.0.{i}',
            'os': 'Linux' if i % 2 == 0 else 'Windows Server 2022'
        })

    for i in range(1, 21):
        devices.append({
            'id': f'pc{i}',
            'type': 'host',
            'name': f'Client {i}',
            'ip': f'10.4.0.{i}',
            'os': 'Windows 11' if i % 2 == 0 else 'macOS Ventura'
        })

    connections: List[Dict[str, Any]] = [
        {'from': 'r1', 'to': 'fw1', 'bandwidth': 40, 'type': 'fiber'},
        {'from': 'r2', 'to': 'fw2', 'bandwidth': 40, 'type': 'fiber'},
        {'from': 'fw1', 'to': 'cs1', 'bandwidth': 40, 'type': 'fiber'},
        {'from': 'fw2', 'to': 'cs2', 'bandwidth': 40, 'type': 'fiber'},
        {'from': 'cs1', 'to': 'cs2', 'bandwidth': 100, 'type': 'fiber'},
    ]

    for i in range(1, 6):
        connections.append({'from': 'cs1', 'to': f'dc{i}', 'bandwidth': 10, 'type': 'fiber'})
        connections.append({'from': 'cs2', 'to': f'dc{i}', 'bandwidth': 10, 'type': 'fiber'})

    for i in range(1, 11):
        dc_id = f'dc{((i - 1) % 5) + 1}'
        connections.append({'from': dc_id, 'to': f'as{i}', 'bandwidth': 1, 'type': 'ethernet'})

    for i in range(1, 11):
        as_id = f'as{((i - 1) % 10) + 1}'
        connections.append({'from': as_id, 'to': f'srv{i}', 'bandwidth': 1, 'type': 'ethernet'})

    for i in range(1, 21):
        as_id = f'as{((i - 1) % 10) + 1}'
        connections.append({'from': as_id, 'to': f'pc{i}', 'bandwidth': 0.1, 'type': 'ethernet'})

    return {
        'name': 'Medium Enterprise Network',
        'description': 'A medium-sized enterprise network with redundancy',
        'devices': devices,
        'connections': connections
    }


def get_large_sample() -> Dict[str, Any]:
    devices: List[Dict[str, Any]] = []
    connections: List[Dict[str, Any]] = []

    devices.append({'id': 'internet', 'type': 'router', 'name': 'Internet Gateway', 'ip': '0.0.0.0', 'model': 'Internet'})

    for i in range(1, 4):
        devices.append({
            'id': f'er{i}',
            'type': 'router',
            'name': f'Edge Router {i}',
            'ip': f'10.0.{i}.1',
            'model': 'Juniper MX480'
        })
        connections.append({'from': 'internet', 'to': f'er{i}', 'bandwidth': 100, 'type': 'fiber'})

    for i in range(1, 5):
        devices.append({
            'id': f'fw{i}',
            'type': 'firewall',
            'name': f'Firewall {i}',
            'ip': f'10.1.{i}.1',
            'model': 'Fortinet 1500D'
        })
        er_id = f'er{((i - 1) % 3) + 1}'
        connections.append({'from': er_id, 'to': f'fw{i}', 'bandwidth': 40, 'type': 'fiber'})

    for i in range(1, 6):
        devices.append({
            'id': f'cs{i}',
            'type': 'core_switch',
            'name': f'Core Switch {i}',
            'ip': f'10.2.{i}.1',
            'model': 'Arista 7050SX'
        })
        fw_id = f'fw{((i - 1) % 4) + 1}'
        connections.append({'from': fw_id, 'to': f'cs{i}', 'bandwidth': 40, 'type': 'fiber'})

    for i in range(1, 11):
        devices.append({
            'id': f'ds{i}',
            'type': 'switch',
            'name': f'Distribution Switch {i}',
            'ip': f'10.3.{i}.1',
            'model': 'Cisco Catalyst 9400'
        })
        cs_id = f'cs{((i - 1) % 5) + 1}'
        connections.append({'from': cs_id, 'to': f'ds{i}', 'bandwidth': 10, 'type': 'fiber'})

    for i in range(1, 31):
        devices.append({
            'id': f'as{i}',
            'type': 'switch',
            'name': f'Access Switch {i}',
            'ip': f'10.4.{i}.1',
            'model': 'HPE Aruba 2930M'
        })
        ds_id = f'ds{((i - 1) % 10) + 1}'
        connections.append({'from': ds_id, 'to': f'as{i}', 'bandwidth': 1, 'type': 'ethernet'})

    for i in range(1, 51):
        devices.append({
            'id': f'srv{i}',
            'type': 'server',
            'name': f'Server {i}',
            'ip': f'10.100.0.{i}',
            'os': 'Ubuntu 22.04' if i % 3 != 0 else 'Windows Server 2022'
        })
        as_id = f'as{((i - 1) % 30) + 1}'
        connections.append({'from': as_id, 'to': f'srv{i}', 'bandwidth': 1, 'type': 'ethernet'})

    for i in range(1, 101):
        devices.append({
            'id': f'cl{i}',
            'type': 'host',
            'name': f'Client {i}',
            'ip': f'10.200.0.{i}',
            'os': 'Windows 11' if i % 2 == 0 else 'Ubuntu 22.04'
        })
        as_id = f'as{((i - 1) % 30) + 1}'
        connections.append({'from': as_id, 'to': f'cl{i}', 'bandwidth': 0.1, 'type': 'ethernet'})

    return {
        'name': 'Large Enterprise Network',
        'description': 'A large-scale enterprise network with 190+ devices',
        'devices': devices,
        'connections': connections
    }


@topology_bp.route('/route', methods=['POST'])
def compute_route():
    try:
        try:
            data = request.get_json(silent=False)
        except Exception:
            return jsonify({'error': 'Invalid JSON format'}), 400

        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        devices = data.get('devices', [])
        connections = data.get('connections', [])
        source_ip = data.get('source_ip', '').strip()
        dest_ip = data.get('dest_ip', '').strip()

        if not source_ip or not dest_ip:
            return jsonify({'error': 'Both source_ip and dest_ip are required'}), 400

        is_valid, errors = validate_topology_data(data)
        if not is_valid:
            return jsonify({'error': 'Invalid topology data', 'details': errors}), 400

        result = route_calculator.compute_shortest_path(
            devices=devices,
            connections=connections,
            source_ip=source_ip,
            dest_ip=dest_ip
        )

        if not result.get('success'):
            return jsonify(result), 404

        path_devices = []
        for device_id in result.get('path', []):
            device = next((d for d in devices if d.get('id') == device_id), None)
            if device:
                path_devices.append(device)

        result['path_devices'] = path_devices

        return jsonify({
            'success': True,
            'data': result
        })

    except Exception as e:
        return jsonify({
            'error': 'Internal server error',
            'message': str(e)
        }), 500
