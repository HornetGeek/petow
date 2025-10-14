import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import DocumentPicker, { DocumentPickerResponse } from 'react-native-document-picker';

interface DocumentPickerProps {
  documents: DocumentPickerResponse[];
  onDocumentsChange: (documents: DocumentPickerResponse[]) => void;
  maxDocuments?: number;
  title?: string;
  allowedTypes?: string[];
}

const DocumentPickerComponent: React.FC<DocumentPickerProps> = ({ 
  documents = [], 
  onDocumentsChange, 
  maxDocuments = 5,
  title = 'الملفات الصحية',
  allowedTypes = ['application/pdf', 'image/jpeg', 'image/png']
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const showDocumentPicker = () => {
    const options = {
      type: allowedTypes,
      allowMultiSelection: true,
    };

    DocumentPicker.pick(options)
      .then((response: DocumentPickerResponse[]) => {
        const newDocuments = [...documents, ...response].slice(0, maxDocuments);
        onDocumentsChange(newDocuments);
      })
      .catch((error) => {
        if (DocumentPicker.isCancel(error)) {
          // User cancelled
        } else {
          Alert.alert('خطأ', 'حدث خطأ في اختيار الملفات');
        }
      });
  };

  const removeDocument = (index: number) => {
    const updatedDocuments = documents.filter((_, i) => i !== index);
    onDocumentsChange(updatedDocuments);
  };

  const getFileIcon = (type: string) => {
    if (type.includes('pdf')) return '📄';
    if (type.includes('image')) return '🖼️';
    return '📎';
  };

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.documentContainer}>
          {documents.map((document, index) => (
            <View key={index} style={styles.documentWrapper}>
              <View style={styles.documentItem}>
                <Text style={styles.documentIcon}>
                  {getFileIcon(document.type || '')}
                </Text>
                <Text style={styles.documentName} numberOfLines={2}>
                  {document.name}
                </Text>
                <Text style={styles.documentSize}>
                  {formatFileSize(document.size || 0)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeDocument(index)}
              >
                <Text style={styles.removeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
          
          {documents.length < maxDocuments && (
            <TouchableOpacity style={styles.addButton} onPress={showDocumentPicker}>
              <Text style={styles.addButtonText}>+</Text>
              <Text style={styles.addButtonLabel}>إضافة ملف</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
      
      <Text style={styles.helperText}>
        يمكنك إضافة حتى {maxDocuments} ملف (PDF, JPG, PNG)
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 10,
  },
  documentContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  documentWrapper: {
    position: 'relative',
  },
  documentItem: {
    width: 120,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e1e8ed',
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  documentIcon: {
    fontSize: 24,
    marginBottom: 5,
  },
  documentName: {
    fontSize: 12,
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: 5,
  },
  documentSize: {
    fontSize: 10,
    color: '#7f8c8d',
    textAlign: 'center',
  },
  removeButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#e74c3c',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  addButton: {
    width: 120,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
    borderWidth: 2,
    borderColor: '#e1e8ed',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 24,
    color: '#7f8c8d',
    marginBottom: 5,
  },
  addButtonLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    textAlign: 'center',
  },
  helperText: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 5,
    textAlign: 'center',
  },
});

export default DocumentPickerComponent;
