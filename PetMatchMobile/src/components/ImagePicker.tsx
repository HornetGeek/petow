import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';
import {
  launchImageLibrary,
  launchCamera,
  ImagePickerResponse,
  MediaType,
  Asset,
} from 'react-native-image-picker';

interface ImagePickerProps {
  images?: string[];
  onImagesChange?: (images: string[]) => void;
  onImageSelected?: (asset: Asset) => void;
  maxImages?: number;
  title?: string;
  placeholder?: string;
}

const ImagePicker: React.FC<ImagePickerProps> = ({ 
  images = [], 
  onImagesChange, 
  onImageSelected,
  maxImages = 4,
  title,
  placeholder = 'إضافة صورة'
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const showImagePicker = () => {
    console.log('Showing image picker...');
    
    Alert.alert(
      'اختر مصدر الصورة',
      'من أين تريد اختيار الصورة؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'الكاميرا', onPress: openCamera },
        { text: 'المعرض', onPress: openGallery },
      ],
      { cancelable: true }
    );
  };

  const openCamera = () => {
    console.log('Opening camera...');
    setIsLoading(true);
    
    const options = {
      mediaType: 'photo' as MediaType,
      includeBase64: false,
      maxHeight: 2000,
      maxWidth: 2000,
      quality: 0.8,
      cameraType: 'back',
    };

    launchCamera(options, (response: ImagePickerResponse) => {
      console.log('Camera response:', response);
      setIsLoading(false);
      
      if (response.didCancel) {
        console.log('User cancelled camera');
        return;
      }
      
      if (response.errorMessage) {
        console.log('Camera error:', response.errorMessage);
        Alert.alert('خطأ', 'حدث خطأ في الكاميرا: ' + response.errorMessage);
        return;
      }
      
      if (response.assets && response.assets.length > 0) {
        const asset = response.assets[0];
        if (asset?.uri) {
          console.log('Image selected from camera:', asset.uri);
          handleAssets([asset]);
        }
      }
    });
  };

  const openGallery = () => {
    console.log('Opening gallery...');
    setIsLoading(true);
    
    const options = {
      mediaType: 'photo' as MediaType,
      includeBase64: false,
      maxHeight: 2000,
      maxWidth: 2000,
      quality: 0.8,
      selectionLimit: onImagesChange ? Math.max(1, maxImages - images.length) : 1,
    };

    launchImageLibrary(options, (response: ImagePickerResponse) => {
      console.log('Gallery response:', response);
      setIsLoading(false);
      
      if (response.didCancel) {
        console.log('User cancelled gallery');
        return;
      }
      
      if (response.errorMessage) {
        console.log('Gallery error:', response.errorMessage);
        Alert.alert('خطأ', 'حدث خطأ في المعرض: ' + response.errorMessage);
        return;
      }
      
      if (response.assets && response.assets.length > 0) {
        console.log('Images selected from gallery:', response.assets.length);
        handleAssets(response.assets);
      }
    });
  };

  const removeImage = (index: number) => {
    if (!onImagesChange) {
      return;
    }

    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
  };

  const { width } = Dimensions.get('window');
  const imageSize = (width - 60) / 3;

  const handleAssets = (assets: Asset[]) => {
    const validAssets = assets.filter(asset => asset?.uri);
    if (!validAssets.length) {
      return;
    }

    if (onImagesChange) {
      const newUris = validAssets
        .map(asset => asset.uri)
        .filter((uri): uri is string => Boolean(uri));

      const totalImages = images.length + newUris.length;
      if (totalImages > maxImages) {
        Alert.alert('تحذير', `يمكنك إضافة ${maxImages} صور فقط`);
        return;
      }

      onImagesChange([...images, ...newUris]);
    }

    if (onImageSelected) {
      onImageSelected(validAssets[0]);
    }
  };

  return (
    <View style={styles.container}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      
      <TouchableOpacity 
        style={styles.addButton} 
        onPress={showImagePicker}
        disabled={
          isLoading || (onImagesChange ? images.length >= maxImages : false)
        }
      >
        <Text style={styles.addButtonText}>
          {isLoading
            ? 'جاري التحميل...'
            : onImagesChange
            ? `+ إضافة صورة (${images.length}/${maxImages})`
            : placeholder}
        </Text>
      </TouchableOpacity>

      {onImagesChange && images.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesContainer}>
          {images.map((uri, index) => (
            <View key={index} style={styles.imageWrapper}>
              <Image source={{ uri }} style={[styles.image, { width: imageSize, height: imageSize }]} />
              <TouchableOpacity 
                style={styles.removeButton} 
                onPress={() => removeImage(index)}
              >
                <Text style={styles.removeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  addButton: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    padding: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  addButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  imagesContainer: {
    flexDirection: 'row',
  },
  imageWrapper: {
    position: 'relative',
    marginRight: 10,
  },
  image: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: 'red',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ImagePicker;
