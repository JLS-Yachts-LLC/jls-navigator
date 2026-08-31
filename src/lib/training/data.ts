/**
 * JLS Yacht Training Institute — CRUD over the training_instructors /
 * training_students / training_courses / training_classes tables (each one
 * a mirror of a Monday.com board — see lib/training/monday.server.ts).
 */
import { supabase } from '@/integrations/supabase/client'

const db = () => supabase as any

export interface TrainingInstructor {
  id: string
  full_name: string
  eid_expiry: string | null
  passport_expiry: string | null
  labour_card_expiry: string | null
  residence_visa_expiry: string | null
  driving_license_expiry: string | null
  seamen_card_expiry: string | null
  class_name: string | null
  schedule: string | null
  extra: Record<string, any> | null
  created_at: string
  updated_at: string
}

export interface TrainingStudent {
  id: string
  full_name: string
  mobile: string | null
  email: string | null
  birthday: string | null
  address: string | null
  payment_status: string | null
  payment_amount: number | null
  class_name: string | null
  instructor_name: string | null
  schedule: string | null
  enrollment_status: string | null
  sequence_number: number | null
  monday_group: string | null
  extra: Record<string, any> | null
  created_at: string
  updated_at: string
}

export interface TrainingCourse {
  id: string
  name: string
  price_aed: number | null
  duration: string | null
  client_type: string | null
  timings: string | null
  extra: Record<string, any> | null
  created_at: string
  updated_at: string
}

export interface TrainingClass {
  id: string
  name: string
  instructor_name: string | null
  status: string | null
  course_name: string | null
  timeline_start: string | null
  timeline_end: string | null
  student_names: string | null
  extra: Record<string, any> | null
  created_at: string
  updated_at: string
}

export interface TrainingCalendarEvent {
  id: string
  event_date: string
  title: string
  time_of_day: string | null
  category: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

async function loadAll<T>(table: string, orderCol: string): Promise<T[]> {
  const all: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db().from(table).select('*').order(orderCol).range(offset, offset + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as T[]))
    if (data.length < 1000) break
  }
  return all
}

export const loadInstructors = () => loadAll<TrainingInstructor>('training_instructors', 'full_name')
export const loadStudents = () => loadAll<TrainingStudent>('training_students', 'full_name')
export const loadCourses = () => loadAll<TrainingCourse>('training_courses', 'name')
export const loadClasses = () => loadAll<TrainingClass>('training_classes', 'name')
export const loadCalendarEvents = () => loadAll<TrainingCalendarEvent>('training_calendar_events', 'event_date')

function makeCrud<T extends { id: string }>(table: string) {
  return {
    create: async (record: Partial<T>): Promise<T> => {
      const { data, error } = await db().from(table).insert([record]).select('*').single()
      if (error) throw error
      return data as T
    },
    patch: async (id: string, patch: Partial<T>): Promise<void> => {
      const { error } = await db().from(table).update(patch).eq('id', id)
      if (error) throw error
    },
    remove: async (id: string): Promise<void> => {
      const { error } = await db().from(table).delete().eq('id', id)
      if (error) throw error
    },
  }
}

export const instructorCrud = makeCrud<TrainingInstructor>('training_instructors')
export const studentCrud = makeCrud<TrainingStudent>('training_students')
export const courseCrud = makeCrud<TrainingCourse>('training_courses')
export const classCrud = makeCrud<TrainingClass>('training_classes')
export const calendarEventCrud = makeCrud<TrainingCalendarEvent>('training_calendar_events')
