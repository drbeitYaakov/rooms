export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: 'admin' | 'general' | 'grade_coordinator' | 'group_coordinator';
  grade_level?: 'א' | 'ב' | 'ג' | 'ד' | 'ה' | 'ו';
  phone?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserData {
  username: string;
  email: string;
  password: string;
  full_name: string;
  role: User['role'];
  grade_level?: User['grade_level'];
  phone?: string;
}

export interface UpdateUserData {
  username?: string;
  email?: string;
  full_name?: string;
  role?: User['role'];
  grade_level?: User['grade_level'];
  phone?: string;
  is_active?: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface UserResponse {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: User['role'];
  grade_level?: User['grade_level'];
  phone?: string;
  is_active: boolean;
}
