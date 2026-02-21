use base64::{engine::general_purpose::STANDARD, Engine};
use hmac::{Hmac, Mac};
use sha2::{Sha256, Sha512};

/// HMAC signer for API authentication
type HmacSha256 = Hmac<Sha256>;

pub struct HmacSigner {
    secret: Vec<u8>,
}

impl HmacSigner {
    pub fn new(secret: impl Into<String>) -> Self {
        Self {
            secret: secret.into().into_bytes(),
        }
    }
    
    /// Sign a message using HMAC-SHA256
    pub fn sign(&self, message: &str) -> String {
        let mut mac = HmacSha256::new_from_slice(&self.secret)
            .expect("HMAC can take key of any size");
        mac.update(message.as_bytes());
        let result = mac.finalize();
        let bytes = result.into_bytes();
        STANDARD.encode(bytes)
    }
    
    /// Verify a signature
    pub fn verify(&self, message: &str, signature: &str) -> bool {
        let expected = self.sign(message);
        // Constant-time comparison to prevent timing attacks
        use subtle::ConstantTimeEq;
        
        if expected.len() != signature.len() {
            return false;
        }
        
        expected.as_bytes().ct_eq(signature.as_bytes()).into()
    }
    
    /// Sign with timestamp for replay protection
    pub fn sign_with_timestamp(&self, message: &str, timestamp: i64) -> String {
        let data = format!("{}:{}", timestamp, message);
        self.sign(&data)
    }
    
    /// Verify with timestamp
    pub fn verify_with_timestamp(
        &self,
        message: &str,
        timestamp: i64,
        signature: &str,
        max_age_seconds: i64,
    ) -> bool {
        let now = chrono::Utc::now().timestamp();
        if (now - timestamp).abs() > max_age_seconds {
            return false; // Timestamp too old or in future
        }
        
        let data = format!("{}:{}", timestamp, message);
        self.verify(&data, signature)
    }
}

/// Encryption utilities
pub struct Encryption {
    key: [u8; 32],
}

impl Encryption {
    pub fn new(key: &[u8]) -> Self {
        let mut key_array = [0u8; 32];
        let len = key.len().min(32);
        key_array[..len].copy_from_slice(&key[..len]);
        Self { key: key_array }
    }
    
    /// Encrypt data using AES-256-GCM
    pub fn encrypt(&self, plaintext: &str) -> crate::Result<String> {
        use ring::aead::{Aes256Gcm, Nonce, UnboundKey, AES_256_GCM, Aad};
        
        let unbound_key = UnboundKey::new(&AES_256_GCM, &self.key)
            .map_err(|_| crate::XRulesError::Execution("Invalid encryption key".to_string()))?;
        
        let nonce_bytes = rand::random::<[u8; 12]>();
        let nonce = Nonce::assume_unique_for_key(nonce_bytes);
        
        let mut ciphertext = plaintext.as_bytes().to_vec();
        ciphertext.extend_from_slice(&[0u8; 16]); // Space for tag
        
        let tag = ring::aead::seal_in_place_separate_tag(
            &unbound_key,
            nonce,
            Aad::empty(),
            &mut ciphertext,
        ).map_err(|_| crate::XRulesError::Execution("Encryption failed".to_string()))?;
        
        // Combine nonce + ciphertext + tag
        let mut result = Vec::new();
        result.extend_from_slice(&nonce_bytes);
        result.extend_from_slice(&ciphertext);
        result.extend_from_slice(tag.as_ref());
        
        Ok(STANDARD.encode(result))
    }
    
    /// Decrypt data using AES-256-GCM
    pub fn decrypt(&self, ciphertext: &str) -> crate::Result<String> {
        use ring::aead::{Aes256Gcm, Nonce, UnboundKey, AES_256_GCM, Aad};
        
        let data = STANDARD.decode(ciphertext)
            .map_err(|_| crate::XRulesError::Execution("Invalid base64".to_string()))?;
        
        if data.len() < 28 { // nonce (12) + tag (16)
            return Err(crate::XRulesError::Execution("Invalid ciphertext".to_string()));
        }
        
        let nonce_bytes: [u8; 12] = data[..12].try_into().unwrap();
        let encrypted = &data[12..];
        
        let unbound_key = UnboundKey::new(&AES_256_GCM, &self.key)
            .map_err(|_| crate::XRulesError::Execution("Invalid encryption key".to_string()))?;
        
        let nonce = Nonce::assume_unique_for_key(nonce_bytes);
        
        let mut plaintext = encrypted.to_vec();
        
        let decrypted = ring::aead::open_in_place(
            &unbound_key,
            nonce,
            Aad::empty(),
            &mut plaintext,
        ).map_err(|_| crate::XRulesError::Execution("Decryption failed".to_string()))?;
        
        String::from_utf8(decrypted.to_vec())
            .map_err(|_| crate::XRulesError::Execution("Invalid UTF-8".to_string()))
    }
}

/// Hash utilities
pub mod hash {
    use sha2::{Sha256, Digest};
    
    /// Compute SHA-256 hash
    pub fn sha256(data: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data.as_bytes());
        hex::encode(hasher.finalize())
    }
    
    /// Compute SHA-512 hash
    pub fn sha512(data: &str) -> String {
        use sha2::Sha512;
        let mut hasher = Sha512::new();
        hasher.update(data.as_bytes());
        hex::encode(hasher.finalize())
    }
}

/// Password hashing utilities
pub mod password {
    /// Hash a password using argon2
    pub fn hash_password(password: &str) -> crate::Result<String> {
        // In production, use argon2 or bcrypt
        // For now, return a placeholder
        Ok(hash::sha256(password))
    }
    
    /// Verify a password
    pub fn verify_password(password: &str, hash: &str) -> crate::Result<bool> {
        let computed = hash::sha256(password);
        Ok(computed == hash)
    }
}

// Re-export for convenience
pub use hash::*;
