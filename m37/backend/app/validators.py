from typing import Dict, Any, List, Tuple

REQUIRED_DEVICE_FIELDS = ['id', 'type']
REQUIRED_CONNECTION_FIELDS = ['from', 'to']

VALID_DEVICE_TYPES = {
    'router', 'firewall', 'core_switch', 'switch',
    'server', 'host', 'client', 'unknown'
}


def validate_topology_data(data: Dict[str, Any]) -> Tuple[bool, List[str]]:
    errors: List[str] = []

    if not isinstance(data, dict):
        return False, ['Input data must be a JSON object']

    devices = data.get('devices')
    if devices is None:
        errors.append('Missing required field: devices')
    elif not isinstance(devices, list):
        errors.append('devices must be a list')
    else:
        device_ids = set()
        for idx, device in enumerate(devices):
            device_errors = validate_device(device, idx)
            errors.extend(device_errors)
            if 'id' in device:
                if device['id'] in device_ids:
                    errors.append(f'Device at index {idx}: duplicate id "{device["id"]}"')
                device_ids.add(device['id'])

    connections = data.get('connections')
    if connections is None:
        errors.append('Missing required field: connections')
    elif not isinstance(connections, list):
        errors.append('connections must be a list')
    else:
        device_ids = {d.get('id') for d in devices if isinstance(d, dict)} if isinstance(devices, list) else set()
        for idx, conn in enumerate(connections):
            conn_errors = validate_connection(conn, idx, device_ids)
            errors.extend(conn_errors)

    return len(errors) == 0, errors


def validate_device(device: Dict[str, Any], index: int) -> List[str]:
    errors: List[str] = []

    if not isinstance(device, dict):
        errors.append(f'Device at index {index}: must be an object')
        return errors

    for field in REQUIRED_DEVICE_FIELDS:
        if field not in device:
            errors.append(f'Device at index {index}: missing required field "{field}"')

    if 'id' in device and not isinstance(device['id'], str):
        errors.append(f'Device at index {index}: id must be a string')

    if 'type' in device:
        if not isinstance(device['type'], str):
            errors.append(f'Device at index {index}: type must be a string')
        elif device['type'] not in VALID_DEVICE_TYPES:
            errors.append(
                f'Device at index {index}: invalid type "{device["type"]}". '
                f'Valid types: {", ".join(sorted(VALID_DEVICE_TYPES))}'
            )

    if 'name' in device and not isinstance(device['name'], str):
        errors.append(f'Device at index {index}: name must be a string')

    if 'ip' in device and not isinstance(device['ip'], str):
        errors.append(f'Device at index {index}: ip must be a string')

    return errors


def validate_connection(
    connection: Dict[str, Any],
    index: int,
    device_ids: set
) -> List[str]:
    errors: List[str] = []

    if not isinstance(connection, dict):
        errors.append(f'Connection at index {index}: must be an object')
        return errors

    for field in REQUIRED_CONNECTION_FIELDS:
        if field not in connection:
            errors.append(f'Connection at index {index}: missing required field "{field}"')

    from_id = connection.get('from')
    to_id = connection.get('to')

    if from_id is not None and device_ids and from_id not in device_ids:
        errors.append(f'Connection at index {index}: "from" references non-existent device "{from_id}"')

    if to_id is not None and device_ids and to_id not in device_ids:
        errors.append(f'Connection at index {index}: "to" references non-existent device "{to_id}"')

    if from_id is not None and to_id is not None and from_id == to_id:
        errors.append(f'Connection at index {index}: cannot connect device "{from_id}" to itself')

    if 'bandwidth' in connection:
        bw = connection['bandwidth']
        if not isinstance(bw, (int, float)):
            errors.append(f'Connection at index {index}: bandwidth must be a number')
        elif bw <= 0:
            errors.append(f'Connection at index {index}: bandwidth must be positive')

    if 'type' in connection and not isinstance(connection['type'], str):
        errors.append(f'Connection at index {index}: type must be a string')

    return errors
