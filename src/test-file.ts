// test-file.ts
export const secretKey = "ghp_1234567890abcdefghijklmnopqrstuvwxyz"; // Lỗi Security: Hardcoded Secret

export function getUser(userId: string) {
    const query = "SELECT * FROM users WHERE id = " + userId; // Lỗi Security: SQL Injection
    return query;
}