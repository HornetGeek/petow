import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import AppIcon from './icons/AppIcon';
import { launchCamera, launchImageLibrary, CameraOptions, ImagePickerResponse, Asset } from 'react-native-image-picker';

export interface VideoFile {
  uri: string;
  type: string;
  name: string;
  fileSize?: number;
  duration?: number;
}

interface VideoPickerProps {
  onVideoSelected: (video: VideoFile) => void;
  placeholder?: string;
  maxDuration?: number;
  maxSizeMB?: number;
}

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

const validateVideo = (video: Asset, maxDuration: number): VideoFile | null => {
  const size = video.fileSize ?? 0;
  if (size > MAX_FILE_SIZE_BYTES) {
    Alert.alert(
      'الفيديو كبير جداً',
      `حجم الفيديو ${(size / (1024 * 1024)).toFixed(1)} ميجابايت. الحد الأقصى 20 ميجابايت. يرجى تصوير فيديو أقصر.`
    );
    return null;
  }

  if (video.duration && video.duration / 1000 > maxDuration + 2) {
    Alert.alert(
      'الفيديو طويل جداً',
      `مدة الفيديو ${Math.round(video.duration / 1000)} ثانية. الحد الأقصى ${maxDuration} ثانية.`
    );
    return null;
  }

  return {
    uri: video.uri,
    type: video.type || 'video/mp4',
    name: video.fileName || `video_${Date.now()}.mp4`,
    fileSize: video.fileSize,
    duration: video.duration,
  };
};

const processResponse = (response: ImagePickerResponse, maxDuration: number, onVideoSelected: (video: VideoFile) => void) => {
  if (response.didCancel) {
    return;
  }
  if (response.errorCode) {
    console.error('VideoPicker Error: ', response.errorMessage);
    Alert.alert('خطأ', response.errorMessage || 'حدث خطأ أثناء اختيار الفيديو');
    return;
  }
  if (response.assets && response.assets.length > 0) {
    const result = validateVideo(response.assets[0], maxDuration);
    if (result) {
      onVideoSelected(result);
    }
  }
};

const VideoPicker: React.FC<VideoPickerProps> = ({
  onVideoSelected,
  placeholder = 'اختر فيديو',
  maxDuration = 15,
}) => {
  const options: CameraOptions = {
    mediaType: 'video',
    videoQuality: 'medium',
    durationLimit: maxDuration,
    saveToPhotos: false,
  };

  const handleTakeVideo = () => {
    launchCamera(options, (response) => processResponse(response, maxDuration, onVideoSelected));
  };

  const handleChooseVideo = () => {
    launchImageLibrary(options, (response) => processResponse(response, maxDuration, onVideoSelected));
  };

  const showPickerOptions = () => {
    Alert.alert(
      placeholder,
      'اختر طريقة تحميل الفيديو',
      [
        { text: 'تصوير فيديو', onPress: handleTakeVideo },
        { text: 'اختيار من المعرض', onPress: handleChooseVideo },
        { text: 'إلغاء', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  return (
    <TouchableOpacity style={styles.container} onPress={showPickerOptions}>
      <View style={styles.iconContainer}>
        <AppIcon name="image" size={40} color="#888" />
      </View>
      <Text style={styles.text}>{placeholder}</Text>
      <Text style={styles.hint}>المدة القصوى: {maxDuration} ثانية</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  iconContainer: {
    marginBottom: 12,
  },
  text: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
    marginBottom: 4,
  },
  hint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
});

export default VideoPicker;
