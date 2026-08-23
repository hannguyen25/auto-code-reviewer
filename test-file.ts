export const secretKey = 'ghp_1234567890abcdefghijklmnopqrstuvwxyz'; export function getUser(userId: string) { return 'SELECT * FROM users WHERE id = ' + userId; }
