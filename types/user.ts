export interface User {
  id: string;
  familyName: string;
  passwordHash: string;
  recoveryCodeHash: string;
  createdAt: string;
}

export interface UsersData {
  users: User[];
}
