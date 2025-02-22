
import { useState, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { DebateCharacter, DebateMessage } from '@/types/debate';
import { playAudioFromBase64, stopAudio } from '@/utils/audio';

export const useDebate = () => {
  const [topic, setTopic] = useState('');
  const [isDebating, setIsDebating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<DebateMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [characters, setCharacters] = useState<DebateCharacter[]>([]);
  const nextGenerationStarted = useRef(false);
  const nextResponseData = useRef<{ text: string; audio: string; character: number } | null>(null);
  const { toast } = useToast();

  const generateDebateResponse = async (characterNumber: number) => {
    try {
      setIsLoading(true);
      const character = characters.find(c => c.character_number === characterNumber);
      if (!character) throw new Error('Character not found');

      const stance = characterNumber === 1 ? 'supportive' : 'critical';
      const { data, error } = await supabase.functions.invoke('debate', {
        body: {
          topic,
          messages,
          character: characterNumber,
          stance,
          characterInfo: {
            name: character.name,
            background: character.background,
            personality: character.personality,
            occupation: character.occupation
          },
          lastOpponentMessage: messages.length > 0 ? messages[messages.length - 1].text : null,
        },
      });

      if (error) throw error;
      if (!data.text) throw new Error('No response received');

      const { data: audioData, error: audioError } = await supabase.functions.invoke('text-to-speech', {
        body: { 
          text: data.text, 
          voiceId: character.voice_id
        }
      });

      if (audioError) throw audioError;
      if (!audioData.audioContent) throw new Error('No audio content received');

      return {
        text: data.text,
        audio: audioData.audioContent,
        character: characterNumber
      };
    } catch (error) {
      console.error('Error generating debate response:', error);
      setIsLoading(false);
      toast({
        title: "Error",
        description: "Failed to generate debate response. Please try again.",
        variant: "destructive",
      });
      return null;
    }
  };

  const playMessage = async (text: string, audio: string, characterNumber: number) => {
    try {
      setIsSpeaking(true);
      nextGenerationStarted.current = false;

      setMessages(prev => [...prev, { character: characterNumber, text }]);
      
      await playAudioFromBase64(audio, (progress) => {
        if (progress >= 25 && !nextGenerationStarted.current && messages.length < 6) {
          nextGenerationStarted.current = true;
          generateDebateResponse(characterNumber === 1 ? 2 : 1).then(response => {
            if (response) {
              nextResponseData.current = response;
            }
          });
        }
      });

      setIsSpeaking(false);
      setIsLoading(false);

      if (nextResponseData.current && messages.length < 6) {
        const { text, audio, character } = nextResponseData.current;
        nextResponseData.current = null;
        await playMessage(text, audio, character);
      }
    } catch (error) {
      console.error('Error playing message:', error);
      setIsSpeaking(false);
      setIsLoading(false);
    }
  };

  const generateCharacters = async (topic: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-characters', {
        body: { topic },
      });

      if (error) throw error;
      if (!data.characters) throw new Error('No characters received');

      return data.characters;
    } catch (error) {
      console.error('Error generating characters:', error);
      toast({
        title: "Error",
        description: "Failed to generate debate characters. Please try again.",
        variant: "destructive",
      });
      return null;
    }
  };

  const startDebate = async () => {
    if (!topic.trim()) return;

    setIsLoading(true);
    const generatedCharacters = await generateCharacters(topic);
    
    if (!generatedCharacters) {
      setIsLoading(false);
      return;
    }

    setCharacters(generatedCharacters);
    setIsDebating(true);
    setMessages([]);
    nextGenerationStarted.current = false;
    nextResponseData.current = null;

    const response = await generateDebateResponse(1);
    if (response) {
      setIsLoading(false);
      await playMessage(response.text, response.audio, response.character);
    }
  };

  const stopDebate = () => {
    stopAudio(500);
    setIsDebating(false);
    setMessages([]);
    setIsLoading(false);
    setTopic('');
    setCharacters([]);
    nextGenerationStarted.current = false;
    nextResponseData.current = null;
  };

  return {
    topic,
    setTopic,
    isDebating,
    isLoading,
    messages,
    isSpeaking,
    characters,
    startDebate,
    stopDebate
  };
};
