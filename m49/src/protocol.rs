use bytes::{Buf, BufMut, BytesMut};
use std::fmt;

const PROTOCOL_NAME: &str = "MQTT";
const PROTOCOL_LEVEL: u8 = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum PacketType {
    Connect = 1,
    Connack = 2,
    Publish = 3,
    Puback = 4,
    Pubrec = 5,
    Pubrel = 6,
    Pubcomp = 7,
    Subscribe = 8,
    Suback = 9,
    Unsubscribe = 10,
    Unsuback = 11,
    Pingreq = 12,
    Pingresp = 13,
    Disconnect = 14,
}

impl PacketType {
    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            1 => Some(Self::Connect),
            2 => Some(Self::Connack),
            3 => Some(Self::Publish),
            4 => Some(Self::Puback),
            5 => Some(Self::Pubrec),
            6 => Some(Self::Pubrel),
            7 => Some(Self::Pubcomp),
            8 => Some(Self::Subscribe),
            9 => Some(Self::Suback),
            10 => Some(Self::Unsubscribe),
            11 => Some(Self::Unsuback),
            12 => Some(Self::Pingreq),
            13 => Some(Self::Pingresp),
            14 => Some(Self::Disconnect),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum QoS {
    AtMostOnce = 0,
    AtLeastOnce = 1,
    ExactlyOnce = 2,
}

impl QoS {
    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            0 => Some(Self::AtMostOnce),
            1 => Some(Self::AtLeastOnce),
            2 => Some(Self::ExactlyOnce),
            _ => None,
        }
    }
}

#[derive(Debug)]
pub struct ConnectPacket {
    pub client_id: String,
    pub keep_alive: u16,
    pub clean_session: bool,
    pub username: Option<String>,
    pub password: Option<String>,
    pub will_topic: Option<String>,
    pub will_message: Option<Vec<u8>>,
}

#[derive(Debug)]
pub struct ConnackPacket {
    pub session_present: bool,
    pub return_code: u8,
}

#[derive(Debug, Clone)]
pub struct PublishPacket {
    pub topic: String,
    pub packet_id: Option<u16>,
    pub payload: Vec<u8>,
    pub qos: QoS,
    pub retain: bool,
    pub dup: bool,
}

#[derive(Debug)]
pub struct SubscribePacket {
    pub packet_id: u16,
    pub topics: Vec<(String, QoS)>,
}

#[derive(Debug)]
pub struct SubackPacket {
    pub packet_id: u16,
    pub return_codes: Vec<u8>,
}

#[derive(Debug)]
pub struct PubackPacket {
    pub packet_id: u16,
}

#[derive(Debug)]
pub struct PingrespPacket;

#[derive(Debug)]
pub enum Packet {
    Connect(ConnectPacket),
    Connack(ConnackPacket),
    Publish(PublishPacket),
    Puback(PubackPacket),
    Subscribe(SubscribePacket),
    Suback(SubackPacket),
    Pingreq,
    Pingresp,
    Disconnect,
}

impl fmt::Display for Packet {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Packet::Connect(p) => write!(f, "Connect(client_id={})", p.client_id),
            Packet::Connack(_) => write!(f, "Connack"),
            Packet::Publish(p) => write!(f, "Publish(topic={})", p.topic),
            Packet::Puback(p) => write!(f, "Puback(id={})", p.packet_id),
            Packet::Subscribe(p) => write!(f, "Subscribe(id={})", p.packet_id),
            Packet::Suback(p) => write!(f, "Suback(id={})", p.packet_id),
            Packet::Pingreq => write!(f, "Pingreq"),
            Packet::Pingresp => write!(f, "Pingresp"),
            Packet::Disconnect => write!(f, "Disconnect"),
        }
    }
}

fn encode_remaining_length(len: usize) -> Vec<u8> {
    let mut encoded = Vec::new();
    let mut remaining = len;
    loop {
        let mut byte = (remaining & 0x7F) as u8;
        remaining >>= 7;
        if remaining > 0 {
            byte |= 0x80;
        }
        encoded.push(byte);
        if remaining == 0 {
            break;
        }
    }
    encoded
}

fn decode_remaining_length(buf: &mut BytesMut) -> Option<usize> {
    let mut multiplier: usize = 1;
    let mut value: usize = 0;
    let mut idx = 0;
    loop {
        if idx >= buf.len() {
            return None;
        }
        let byte = buf[idx];
        value += ((byte & 0x7F) as usize) * multiplier;
        idx += 1;
        if (byte & 0x80) == 0 {
            break;
        }
        multiplier *= 128;
        if multiplier > 128 * 128 * 128 {
            return None;
        }
    }
    buf.advance(idx);
    Some(value)
}

fn read_utf8_string(buf: &mut BytesMut) -> Option<String> {
    if buf.len() < 2 {
        return None;
    }
    let len = buf.get_u16() as usize;
    if buf.len() < len {
        return None;
    }
    let s = String::from_utf8_lossy(&buf[..len]).to_string();
    buf.advance(len);
    Some(s)
}

fn write_utf8_string(buf: &mut BytesMut, s: &str) {
    buf.put_u16(s.len() as u16);
    buf.put_slice(s.as_bytes());
}

fn read_bytes(buf: &mut BytesMut, len: usize) -> Option<Vec<u8>> {
    if buf.len() < len {
        return None;
    }
    let data = buf[..len].to_vec();
    buf.advance(len);
    Some(data)
}

pub fn decode_packet(buf: &mut BytesMut) -> Result<Option<Packet>, String> {
    if buf.is_empty() {
        return Ok(None);
    }
    let first_byte = buf[0];
    let ptype_val = (first_byte >> 4) & 0x0F;
    let flags = first_byte & 0x0F;

    let ptype = PacketType::from_u8(ptype_val)
        .ok_or_else(|| format!("Unknown packet type: {}", ptype_val))?;

    let mut tmp = buf.clone();
    tmp.advance(1);
    let remaining_len = match decode_remaining_length(&mut tmp) {
        Some(len) => len,
        None => return Ok(None),
    };

    let header_len = buf.len() - tmp.len();
    if buf.len() < header_len + remaining_len {
        return Ok(None);
    }

    buf.advance(1);
    decode_remaining_length(buf);

    let mut payload_buf = buf.split_to(remaining_len);

    let packet = match ptype {
        PacketType::Connect => {
            let proto_name = read_utf8_string(&mut payload_buf)
                .ok_or("Invalid protocol name")?;
            if proto_name != PROTOCOL_NAME {
                return Err(format!("Unsupported protocol: {}", proto_name));
            }
            let level = payload_buf.get_u8();
            if level != PROTOCOL_LEVEL {
                return Err(format!("Unsupported protocol level: {}", level));
            }
            let connect_flags = payload_buf.get_u8();
            let keep_alive = payload_buf.get_u16();

            let clean_session = (connect_flags & 0x02) != 0;
            let has_will = (connect_flags & 0x04) != 0;
            let has_username = (connect_flags & 0x80) != 0;
            let has_password = (connect_flags & 0x40) != 0;
            let _will_qos = (connect_flags >> 3) & 0x03;
            let _will_retain = (connect_flags & 0x20) != 0;

            let client_id = read_utf8_string(&mut payload_buf)
                .ok_or("Invalid client ID")?;

            let will_topic = if has_will {
                read_utf8_string(&mut payload_buf)
            } else {
                None
            };
            let will_message = if has_will {
                let len = payload_buf.remaining();
                read_bytes(&mut payload_buf, len)
            } else {
                None
            };
            let username = if has_username {
                read_utf8_string(&mut payload_buf)
            } else {
                None
            };
            let password = if has_password {
                read_utf8_string(&mut payload_buf)
            } else {
                None
            };

            Packet::Connect(ConnectPacket {
                client_id,
                keep_alive,
                clean_session,
                username,
                password,
                will_topic,
                will_message,
            })
        }
        PacketType::Publish => {
            let qos_val = (flags >> 1) & 0x03;
            let qos = QoS::from_u8(qos_val).ok_or("Invalid QoS")?;
            let dup = (flags & 0x08) != 0;
            let retain = (flags & 0x01) != 0;

            let topic = read_utf8_string(&mut payload_buf)
                .ok_or("Invalid publish topic")?;

            let packet_id = if qos != QoS::AtMostOnce {
                Some(payload_buf.get_u16())
            } else {
                None
            };

            let payload_len = payload_buf.remaining();
            let payload = read_bytes(&mut payload_buf, payload_len)
                .ok_or("Invalid publish payload")?;

            Packet::Publish(PublishPacket {
                topic,
                packet_id,
                payload,
                qos,
                retain,
                dup,
            })
        }
        PacketType::Subscribe => {
            let packet_id = payload_buf.get_u16();
            let mut topics = Vec::new();
            while payload_buf.remaining() >= 3 {
                let topic_filter = read_utf8_string(&mut payload_buf)
                    .ok_or("Invalid subscribe topic")?;
                let requested_qos = payload_buf.get_u8();
                let qos = QoS::from_u8(requested_qos)
                    .ok_or("Invalid subscribe QoS")?;
                topics.push((topic_filter, qos));
            }
            Packet::Subscribe(SubscribePacket { packet_id, topics })
        }
        PacketType::Pingreq => Packet::Pingreq,
        PacketType::Disconnect => Packet::Disconnect,
        _ => return Err(format!("Unhandled packet type: {:?}", ptype)),
    };

    Ok(Some(packet))
}

pub fn encode_connack(connack: &ConnackPacket) -> Vec<u8> {
    let mut buf = BytesMut::new();
    let mut remaining = BytesMut::new();
    let session_present_flag = if connack.session_present { 1u8 } else { 0u8 };
    remaining.put_u8(session_present_flag);
    remaining.put_u8(connack.return_code);

    buf.put_u8(0x20);
    buf.extend(encode_remaining_length(remaining.len()));
    buf.extend(remaining);
    buf.to_vec()
}

pub fn encode_suback(suback: &SubackPacket) -> Vec<u8> {
    let mut buf = BytesMut::new();
    let mut remaining = BytesMut::new();
    remaining.put_u16(suback.packet_id);
    for code in &suback.return_codes {
        remaining.put_u8(*code);
    }

    buf.put_u8(0x90);
    buf.extend(encode_remaining_length(remaining.len()));
    buf.extend(remaining);
    buf.to_vec()
}

pub fn encode_puback(packet_id: u16) -> Vec<u8> {
    let mut buf = BytesMut::new();
    buf.put_u8(0x40);
    buf.put_u8(2);
    buf.put_u16(packet_id);
    buf.to_vec()
}

pub fn encode_publish(publish: &PublishPacket) -> Vec<u8> {
    let mut buf = BytesMut::new();
    let mut remaining = BytesMut::new();

    write_utf8_string(&mut remaining, &publish.topic);

    if let Some(pid) = publish.packet_id {
        remaining.put_u16(pid);
    }

    remaining.extend(&publish.payload);

    let qos_bits = (publish.qos as u8) << 1;
    let dup_bit = if publish.dup { 0x08 } else { 0x00 };
    let retain_bit = if publish.retain { 0x01 } else { 0x00 };
    let first = 0x30 | qos_bits | dup_bit | retain_bit;

    buf.put_u8(first);
    buf.extend(encode_remaining_length(remaining.len()));
    buf.extend(remaining);
    buf.to_vec()
}

pub fn encode_pingresp() -> Vec<u8> {
    vec![0xD0, 0x00]
}

pub fn topic_matches(filter: &str, topic: &str) -> bool {
    let filter_parts: Vec<&str> = filter.split('/').collect();
    let topic_parts: Vec<&str> = topic.split('/').collect();

    let mut fi = 0;
    let mut ti = 0;

    while fi < filter_parts.len() {
        if filter_parts[fi] == "#" {
            return true;
        }
        if ti >= topic_parts.len() {
            return false;
        }
        if filter_parts[fi] == "+" {
            fi += 1;
            ti += 1;
            continue;
        }
        if filter_parts[fi] != topic_parts[ti] {
            return false;
        }
        fi += 1;
        ti += 1;
    }

    ti == topic_parts.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_topic_matches_exact() {
        assert!(topic_matches("sensor/temp", "sensor/temp"));
        assert!(!topic_matches("sensor/temp", "sensor/humidity"));
    }

    #[test]
    fn test_topic_matches_single_wildcard() {
        assert!(topic_matches("sensor/+", "sensor/temp"));
        assert!(topic_matches("sensor/+", "sensor/humidity"));
        assert!(!topic_matches("sensor/+", "sensor/temp/room1"));
        assert!(topic_matches("+/temp", "room1/temp"));
    }

    #[test]
    fn test_topic_matches_multi_wildcard() {
        assert!(topic_matches("sensor/#", "sensor/temp"));
        assert!(topic_matches("sensor/#", "sensor/temp/room1"));
        assert!(topic_matches("#", "anything/at/all"));
    }

    #[test]
    fn test_encode_decode_remaining_length() {
        let encoded = encode_remaining_length(127);
        assert_eq!(encoded, vec![127]);

        let encoded = encode_remaining_length(128);
        assert_eq!(encoded, vec![0x80, 0x01]);
    }
}
