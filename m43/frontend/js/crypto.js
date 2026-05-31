class CryptoUtils {
    constructor() {
        this.algorithm = {
            name: 'AES-GCM',
            ivLength: 12,
            saltLength: 16
        };
    }

    async deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const passwordKey = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );

        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            passwordKey,
            { name: this.algorithm.name, length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async encrypt(data, password) {
        try {
            const encoder = new TextEncoder();
            const dataBuffer = typeof data === 'string' 
                ? encoder.encode(data) 
                : encoder.encode(JSON.stringify(data));

            const salt = crypto.getRandomValues(new Uint8Array(this.algorithm.saltLength));
            const iv = crypto.getRandomValues(new Uint8Array(this.algorithm.ivLength));

            const key = await this.deriveKey(password, salt);

            const encrypted = await crypto.subtle.encrypt(
                {
                    name: this.algorithm.name,
                    iv: iv
                },
                key,
                dataBuffer
            );

            const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
            result.set(salt, 0);
            result.set(iv, salt.length);
            result.set(new Uint8Array(encrypted), salt.length + iv.length);

            return this.arrayBufferToBase64(result);
        } catch (error) {
            console.error('加密失败:', error);
            throw new Error('加密失败，请检查密码');
        }
    }

    async decrypt(encryptedBase64, password) {
        try {
            const encryptedBuffer = this.base64ToArrayBuffer(encryptedBase64);
            
            const salt = encryptedBuffer.slice(0, this.algorithm.saltLength);
            const iv = encryptedBuffer.slice(this.algorithm.saltLength, this.algorithm.saltLength + this.algorithm.ivLength);
            const data = encryptedBuffer.slice(this.algorithm.saltLength + this.algorithm.ivLength);

            const key = await this.deriveKey(password, salt);

            const decrypted = await crypto.subtle.decrypt(
                {
                    name: this.algorithm.name,
                    iv: iv
                },
                key,
                data
            );

            const decoder = new TextDecoder();
            const decryptedText = decoder.decode(decrypted);

            try {
                return JSON.parse(decryptedText);
            } catch {
                return decryptedText;
            }
        } catch (error) {
            console.error('解密失败:', error);
            throw new Error('解密失败，密码错误或数据被篡改');
        }
    }

    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return this.arrayBufferToBase64(hashBuffer);
    }
}

window.cryptoUtils = new CryptoUtils();
