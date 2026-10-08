export type AuthUser = {
  id: string
  name: string
  email: string
  role: 'USER' | 'ADMIN'
}

export type Project = {
  id: string
  user_id: string
  name: string
  description: string
  domain: string
  requirements: string
  status: 'DRAFT' | 'ANALYZING' | 'COMPLETED' | 'FAILED'
  created_at: string
  updated_at: string
}

export const demoUser: AuthUser = {
  id: 'user-demo-01',
  name: 'Demo Architect',
  email: 'demo@softarchitect.ai',
  role: 'USER',
}

export const demoProjects: Project[] = [
  {
    id: 'proj-101',
    user_id: 'user-demo-01',
    name: 'Food Delivery Platform',
    description: 'Marketplace for ordering food from local restaurants with payments and tracking.',
    domain: 'FoodTech',
    requirements: 'Customer auth, restaurant catalog, cart, payment flow, delivery tracking, admin reporting.',
    status: 'COMPLETED',
    created_at: '2026-10-01T09:00:00.000Z',
    updated_at: '2026-10-06T12:00:00.000Z',
  },
  {
    id: 'proj-102',
    user_id: 'user-demo-01',
    name: 'Learning Management System',
    description: 'Modern platform for courses, assignments, and student progress.',
    domain: 'EdTech',
    requirements: 'Course catalog, enrollment, quizzes, mentor dashboards, analytics and notifications.',
    status: 'ANALYZING',
    created_at: '2026-10-04T08:30:00.000Z',
    updated_at: '2026-10-08T15:30:00.000Z',
  },
  {
    id: 'proj-103',
    user_id: 'user-demo-01',
    name: 'Inventory Control Suite',
    description: 'Warehouse inventory and vendor operations management for multi-branch stores.',
    domain: 'Logistics',
    requirements: 'Purchase orders, stock tracking, supplier management, reorder alerts and audit trails.',
    status: 'DRAFT',
    created_at: '2026-10-07T11:00:00.000Z',
    updated_at: '2026-10-08T11:00:00.000Z',
  },
]
