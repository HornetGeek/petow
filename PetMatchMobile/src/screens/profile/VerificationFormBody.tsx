import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
} from 'react-native';
import Video, { VideoRef } from 'react-native-video';
import ImagePicker from '../../components/ImagePicker';
import VideoPicker, { VideoFile } from '../../components/VideoPicker';
import AppIcon from '../../components/icons/AppIcon';
import { apiService } from '../../services/api';

type IdPhotoAsset = { uri: string; type: string; name: string; fileSize?: number };

type Props = {
  onSubmitted: () => void;
  onCancel?: () => void;
};

const VerificationFormBody: React.FC<Props> = ({ onSubmitted, onCancel }) => {
  const [idPhoto, setIdPhoto] = useState<IdPhotoAsset | null>(null);
  const [selfieVideo, setSelfieVideo] = useState<VideoFile | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const videoRef = useRef<VideoRef>(null);

  const toggleVideoPlayback = () => setIsPlaying((p) => !p);

  const handleSubmit = async () => {
    if (!idPhoto) {
      Alert.alert('خطأ', 'يرجى اختيار صورة الهوية');
      return;
    }

    if (!selfieVideo) {
      Alert.alert('خطأ', 'يرجى تصوير فيديو سيلفي مع الهوية');
      return;
    }

    try {
      setSubmitting(true);
      const response = await apiService.submitVerification(idPhoto, selfieVideo);

      if (response.success) {
        Alert.alert(
          'تم إرسال الطلب',
          'تم إرسال طلب التحقق بنجاح. سيتم مراجعته في أقرب وقت.',
          [
            {
              text: 'حسناً',
              onPress: () => {
                onSubmitted();
              },
            },
          ]
        );
      } else {
        Alert.alert('خطأ', response.error || 'فشل إرسال طلب التحقق');
      }
    } catch (error) {
      console.error('Error submitting verification:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء إرسال طلب التحقق');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>صورة بطاقة الهوية *</Text>
        <ImagePicker
          onImageSelected={setIdPhoto}
          placeholder="اختر صورة بطاقة الهوية"
          maxImages={1}
        />
        {idPhoto && (
          <Image source={{ uri: idPhoto.uri }} style={styles.preview} />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>فيديو سيلفي مع الهوية *</Text>
        <VideoPicker
          onVideoSelected={setSelfieVideo}
          placeholder="صور فيديو سيلفي مع الهوية"
          maxDuration={15}
        />
        {selfieVideo && (
          <View style={styles.videoPreviewContainer}>
            <View style={styles.videoPlayerWrap}>
              <Video
                ref={videoRef}
                source={{ uri: selfieVideo.uri }}
                style={styles.videoPlayer}
                resizeMode="contain"
                paused={!isPlaying}
                onError={(e) => {
                  console.error('Video playback error:', e);
                  Alert.alert('خطأ', 'تعذر تشغيل الفيديو');
                  setIsPlaying(false);
                }}
                onEnd={() => setIsPlaying(false)}
                repeat={false}
              />
              <TouchableOpacity
                style={styles.playOverlay}
                onPress={toggleVideoPlayback}
                activeOpacity={0.7}
              >
                <View style={styles.playButtonCircle}>
                  <AppIcon
                    name={isPlaying ? 'close' : 'search'}
                    size={24}
                    color="#fff"
                  />
                </View>
              </TouchableOpacity>
            </View>
            <View style={styles.videoInfoRow}>
              <Text style={styles.videoInfoText}>
                تم حفظ الفيديو
                {selfieVideo.fileSize ? ` • ${(selfieVideo.fileSize / (1024 * 1024)).toFixed(1)} MB` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.reRecordButton}
              onPress={() => { setSelfieVideo(null); setIsPlaying(false); }}
            >
              <Text style={styles.reRecordButtonText}>إعادة التصوير</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>إرسال طلب التحقق</Text>
        )}
      </TouchableOpacity>

      {onCancel ? (
        <TouchableOpacity onPress={onCancel} style={styles.cancel}>
          <Text style={styles.cancelText}>إلغاء</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

export default VerificationFormBody;

const styles = StyleSheet.create({
  container: {
    // No padding/gap — keep visuals identical to the original screen,
    // where these sections lived directly inside the ScrollView's content.
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginTop: 12,
    resizeMode: 'cover',
  },
  videoPreviewContainer: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  videoPlayerWrap: {
    position: 'relative',
    height: 220,
    backgroundColor: '#000',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoInfoRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  videoInfoText: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
  },
  reRecordButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  reRecordButtonText: {
    fontSize: 14,
    color: '#F44336',
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonDisabled: {
    backgroundColor: '#A5D6A7',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancel: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelText: {
    color: '#6B7280',
    fontSize: 14,
  },
});
