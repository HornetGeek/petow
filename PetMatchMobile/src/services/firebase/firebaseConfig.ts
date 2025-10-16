import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

export { firestore, auth };

export interface FirebaseMessage {
  id: string;
  text: string;
  senderId: number;
  senderName: string;
  timestamp: Date;
  type: 'text' | 'image' | 'system';
  imageUrl?: string;
}

export class MessageService {
  static async sendMessage(chatId: string, messageData: {
    text: string;
    senderId: number;
    senderName: string;
    type: 'text' | 'image' | 'system';
    imageUrl?: string;
  }, options?: { clientId?: string }): Promise<boolean> {
    try {
      console.log('💬 MessageService - Sending message to Firebase:', chatId, messageData?.type, options?.clientId);
      
      const messagesCol = firestore()
        .collection('chats')
        .doc(chatId)
        .collection('messages');
      const messageRef = options?.clientId ? messagesCol.doc(options.clientId) : messagesCol.doc();
      
      await messageRef.set({
        ...messageData,
        // Use serverTimestamp when available; fallback to client timestamp
        timestamp: (firestore as any).FieldValue?.serverTimestamp?.() || new Date(),
        createdAt: new Date().toISOString(),
      });
      // Update parent chat's updatedAt to keep lists fresh
      await firestore()
        .collection('chats')
        .doc(chatId)
        .set({ updatedAt: (firestore as any).FieldValue?.serverTimestamp?.() || new Date() }, { merge: true });
      
      console.log('✅ Message sent to Firebase successfully');
      return true;
    } catch (error) {
      console.error('❌ Error sending message to Firebase:', error);
      // Don't throw error, just log it
      console.log('⚠️ Continuing with local message storage');
      return false;
    }
  }

  static subscribeToMessages(
    chatId: string,
    onMessagesUpdate: (messages: FirebaseMessage[]) => void
  ): () => void {
    try {
      console.log(' MessageService - Setting up listener for:', chatId);
      
      const unsubscribe = firestore()
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot(
          (snapshot) => {
            console.log('💬 MessageService - Received snapshot with', snapshot.docs.length, 'messages');
            const messages: FirebaseMessage[] = [];
            snapshot.forEach((doc) => {
              const data = doc.data();
              messages.push({
                id: doc.id,
                text: data.text || '',
                senderId: data.senderId || 0,
                senderName: data.senderName || 'Unknown',
                timestamp: data.timestamp?.toDate() || new Date(),
                type: data.type || 'text',
                imageUrl: data.imageUrl,
              });
            });
            onMessagesUpdate(messages);
          },
          (error) => {
            console.error('❌ Error listening to messages:', error);
            // Provide fallback messages
            onMessagesUpdate([]);
          }
        );
      
      return unsubscribe;
    } catch (error) {
      console.error('❌ Error setting up message listener:', error);
      // Return empty unsubscribe function
      return () => {};
    }
  }

  static async getMessages(chatId: string): Promise<FirebaseMessage[]> {
    try {
      console.log('💬 MessageService - Getting messages for:', chatId);
      
      const snapshot = await firestore()
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .get();
      
      const messages: FirebaseMessage[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        messages.push({
          id: doc.id,
          text: data.text || '',
          senderId: data.senderId || 0,
          senderName: data.senderName || 'Unknown',
          timestamp: data.timestamp?.toDate() || new Date(),
          type: data.type || 'text',
          imageUrl: data.imageUrl,
        });
      });
      
      console.log('✅ Retrieved', messages.length, 'messages from Firebase');
      return messages;
    } catch (error) {
      console.error('❌ Error getting messages:', error);
      return [];
    }
  }

  static async createChatRoom(chatId: string, participants: number[]): Promise<void> {
    try {
      console.log(' MessageService - Creating chat room:', chatId);
      
      await firestore()
        .collection('chats')
        .doc(chatId)
        .set({
          participants,
          createdAt: firestore.FieldValue.serverTimestamp(),
          updatedAt: firestore.FieldValue.serverTimestamp(),
          isActive: true,
        });
      
      console.log('✅ Chat room created in Firebase successfully');
    } catch (error) {
      console.error('❌ Error creating chat room:', error);
      // Don't throw error, just log it
      console.log('⚠️ Continuing without Firebase chat room creation');
    }
  }
} 
