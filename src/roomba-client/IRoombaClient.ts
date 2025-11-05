import type { RobotMission } from 'dorita980'

export interface IRoombaClient {
  // Device/session lifecycle
  end: () => void

  // Commands
  clean: () => Promise<void>
  cleanRoom: (mission: RobotMission | Record<string, unknown>) => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  dock: () => Promise<void>
  find?: () => Promise<void>

  // State
  getRobotState: <T = unknown>(keys: string[]) => Promise<T>
}
