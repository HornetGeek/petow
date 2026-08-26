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
  /**
   * User IDs who have read this message. The sender is auto-added on send,
   * so a message with `readBy.length > 1` (or contains a non-sender id)
   * means the recipient(s) have seen it. Surfaced in chat as ✓ (delivered)
   * vs ✓✓ (read).
   */
  readBy?: number[];
}

export class MessageService {
  static async sendMessage(chatId: string, messageData: {
    text: string;
    senderId: number;
    senderName: string;
    type: 'text' | 'image' | 'system';
    imageUrl?: string;
  }, options?: { clientId?: string; recipientIds?: number[] }): Promise<boolean> {
    try {
      console.log('💬 MessageService - Sending message to Firebase:', chatId, messageData?.type, options?.clientId);

      const messagesCol = firestore()
        .collection('chats')
        .doc(chatId)
        .collection('messages');
      const messageRef = options?.clientId ? messagesCol.doc(options.clientId) : messagesCol.doc();
      const serverTimestamp = (firestore as any).FieldValue?.serverTimestamp?.() || new Date();

      await messageRef.set({
        ...messageData,
        // Use serverTimestamp when available; fallback to client timestamp
        timestamp: serverTimestamp,
        createdAt: new Date().toISOString(),
        // Sender has obviously seen their own message; recipients add
        // themselves via markMessagesAsRead when they view it.
        readBy: [messageData.senderId],
      });

      // Update parent chat document so the inbox can show last-message
      // preview + bump unread counters for everyone except the sender.
      // Image messages get a friendly placeholder instead of the raw
      // '[صورة]' text the chat itself uses.
      const lastMessageText = messageData.type === 'image'
        ? '📷 صورة'
        : (messageData.text || '').slice(0, 120);
      const parentUpdate: Record<string, any> = {
        updatedAt: serverTimestamp,
        lastMessage: lastMessageText,
        lastMessageAt: serverTimestamp,
        lastMessageSenderId: messageData.senderId,
      };
      if (Array.isArray(options?.recipientIds)) {
        const increment = (firestore as any).FieldValue?.increment?.(1);
        for (const recipientId of options!.recipientIds!) {
          if (!recipientId || recipientId === messageData.senderId) continue;
          parentUpdate[`unreadCount.${recipientId}`] = increment ?? 1;
        }
      }
      await firestore()
        .collection('chats')
        .doc(chatId)
        .set(parentUpdate, { merge: true });

      console.log('✅ Message sent to Firebase successfully');
      return true;
    } catch (error) {
      console.error('❌ Error sending message to Firebase:', error);
      // Don't throw error, just log it
      console.log('⚠️ Continuing with local message storage');
      return false;
    }
  }

  /**
   * Resets the unread counter for `userId` in the chat document. Call this
   * when the user opens a chat or whenever they're actively viewing it.
   * No-op safely if the chat doc / field doesn't exist yet.
   */
  static async markChatAsRead(chatId: string, userId: number): Promise<void> {
    if (!chatId || !userId) return;
    try {
      await firestore()
        .collection('chats')
        .doc(chatId)
        .set({ [`unreadCount.${userId}`]: 0 }, { merge: true });
    } catch (error) {
      console.warn('⚠️ markChatAsRead failed (non-fatal):', error);
    }
  }

  /**
   * Adds `userId` to each message's `readBy` array so the sender can see
   * a ✓✓ instead of ✓. Pass only the message IDs the user just saw and
   * isn't already in (caller filters). FieldValue.arrayUnion is a no-op
   * when the user is already present, so duplicate calls are safe — but
   * filtering still saves write-cost.
   */
  static async markMessagesAsRead(
    chatId: string,
    messageIds: string[],
    userId: number,
  ): Promise<void> {
    if (!chatId || !userId || messageIds.length === 0) return;
    try {
      const arrayUnion = (firestore as any).FieldValue?.arrayUnion?.(userId);
      const batch = firestore().batch();
      const messagesCol = firestore().collection('chats').doc(chatId).collection('messages');
      for (const messageId of messageIds) {
        batch.set(
          messagesCol.doc(messageId),
          { readBy: arrayUnion ?? [userId] },
          { merge: true },
        );
      }
      await batch.commit();
    } catch (error) {
      console.warn('⚠️ markMessagesAsRead failed (non-fatal):', error);
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
                readBy: Array.isArray(data.readBy) ? data.readBy : undefined,
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
          readBy: Array.isArray(data.readBy) ? data.readBy : undefined,
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
