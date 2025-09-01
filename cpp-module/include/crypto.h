#ifndef CRYPTO_H
#define CRYPTO_H

#include <string>
#include <vector>

class CryptoUtils {
public:
    static std::string hash(const std::string& data, const std::string& algorithm);
    static std::string sha256(const std::string& data);
    static std::string sha512(const std::string& data);
    static std::string md5(const std::string& data);
    static std::vector<uint8_t> generateRandomBytes(size_t length);
    static std::string encrypt(const std::string& data, const std::string& key);
    static std::string decrypt(const std::string& data, const std::string& key);
    static bool verifySignature(const std::string& data, const std::string& signature, const std::string& publicKey);
    static std::string createSignature(const std::string& data, const std::string& privateKey);
};

#endif