export interface User {
  id: string;
  familyName: string;
  passwordHash: string;
  createdAt: string;
}

export interface UsersData {
  users: User[];
}
