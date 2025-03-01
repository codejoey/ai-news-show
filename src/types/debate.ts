export interface DebateCharacter {
  id?: number;
  name: string;
  age: number;
  location: string;
  occupation: string;
  background: string;
  personality: string;
  avatar_url: string;
  voice_id: string;
  character_number: number;
  system_prompt: string;
}

export interface DebateMessage {
  character: number;
  text: string;
  audio?: string;
  characterName?: string;
}

