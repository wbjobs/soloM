#!/usr/bin/env python3
import socket
import struct
import json

def test_server():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect(("127.0.0.1", 8080))
    s.settimeout(5)
    
    print("Connected, reading header...")
    header = s.recv(4)
    print(f"Header bytes: {header.hex()}")
    
    if len(header) == 4:
        msg_len = struct.unpack('<I', header)[0]
        print(f"Message length: {msg_len}")
        
        data = b''
        while len(data) < msg_len:
            chunk = s.recv(msg_len - len(data))
            if not chunk:
                break
            data += chunk
        
        print(f"Received data ({len(data)} bytes): {data[:200]}")
        print(f"Data as string: {data[:200].decode('utf-8', errors='replace')}")
        
        try:
            msg = json.loads(data)
            print(f"Parsed JSON: {json.dumps(msg, indent=2)}")
        except Exception as e:
            print(f"JSON parse error: {e}")
    
    s.close()

if __name__ == "__main__":
    test_server()
