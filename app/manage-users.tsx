import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Edit2, Trash2, Mail, User, Lock, UserPlus, Shield, Users } from 'lucide-react-native';
import { useAuth } from '@/hooks/auth-store';
import { databaseService } from '@/hooks/database';
import { User as UserType, UserRole } from '@/types/auth';
import Colors from '@/constants/colors';

export default function ManageUsersScreen() {
  const { login } = useAuth();
  const [users, setUsers] = useState<UserType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirmPassword, setNewConfirmPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('standard');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      loadUsers();
    }
  }, [isAuthenticated]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const allUsers = await databaseService.getAllUsers();
      setUsers(allUsers);
    } catch (error) {
      console.error('Error loading users:', error);
      Alert.alert('Error', 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const hashPassword = (password: string): string => {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  };

  const handleEditUser = (user: UserType) => {
    setSelectedUser(user);
    setEditUsername(user.username);
    setEditEmail(user.email);
    setEditFullName(user.fullName);
    setEditPassword('');
    setEditModalVisible(true);
  };

  const handleSaveUser = async () => {
    if (!selectedUser) return;

    if (!editUsername.trim() || !editEmail.trim()) {
      Alert.alert('Error', 'Username and email are required');
      return;
    }

    if (!editEmail.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    try {
      await databaseService.updateUser(selectedUser.id, editUsername.trim(), editEmail.trim(), editFullName.trim());

      if (editPassword.trim()) {
        if (editPassword.length < 3) {
          Alert.alert('Error', 'Password must be at least 3 characters long');
          return;
        }
        const passwordHash = hashPassword(editPassword);
        await databaseService.updateUserPassword(selectedUser.id, passwordHash);
      }

      Alert.alert('Success', 'User updated successfully');
      setEditModalVisible(false);
      loadUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      Alert.alert('Error', 'Failed to update user');
    }
  };

  const handleDeleteUser = (user: UserType) => {
    const adminUsers = users.filter(u => u.role === 'admin');
    if (user.role === 'admin' && adminUsers.length <= 1) {
      Alert.alert('Cannot Delete', 'Cannot delete the last admin user');
      return;
    }

    Alert.alert(
      'Delete User',
      `Are you sure you want to delete user "${user.username}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await databaseService.deleteUser(user.id);
              Alert.alert('Success', 'User deleted successfully');
              loadUsers();
            } catch (error) {
              console.error('Error deleting user:', error);
              Alert.alert('Error', 'Failed to delete user');
            }
          },
        },
      ]
    );
  };

  const handleBack = () => {
    router.back();
  };

  const handleAuthenticate = async () => {
    if (!authUsername.trim() || !authPassword.trim()) {
      Alert.alert('Error', 'Please enter both username and password');
      return;
    }

    setIsAuthenticating(true);
    
    const user = await databaseService.getUserByUsername(authUsername.trim());
    
    if (!user) {
      setIsAuthenticating(false);
      Alert.alert('Authentication Failed', 'User not found');
      return;
    }

    if (user.role !== 'admin') {
      setIsAuthenticating(false);
      Alert.alert('Access Denied', 'Only admin users can access this page');
      return;
    }

    const success = await login(authUsername.trim(), authPassword);
    setIsAuthenticating(false);

    if (success) {
      setIsAuthenticated(true);
    } else {
      Alert.alert('Authentication Failed', 'Invalid username or password');
    }
  };

  const handleOpenCreateModal = () => {
    setNewUsername('');
    setNewEmail('');
    setNewFullName('');
    setNewPassword('');
    setNewConfirmPassword('');
    setNewRole('standard');
    setCreateModalVisible(true);
  };

  const handleCreateUser = async () => {
    if (!newUsername.trim() || !newEmail.trim() || !newFullName.trim() || !newPassword.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (!newEmail.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (newPassword !== newConfirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (newPassword.length < 3) {
      Alert.alert('Error', 'Password must be at least 3 characters long');
      return;
    }

    setIsCreating(true);
    try {
      const existingUser = await databaseService.getUserByUsername(newUsername.trim());
      if (existingUser) {
        Alert.alert('Error', 'Username already exists');
        setIsCreating(false);
        return;
      }

      const passwordHash = hashPassword(newPassword);
      await databaseService.createUser(
        newUsername.trim(),
        passwordHash,
        newEmail.trim(),
        newFullName.trim(),
        newRole
      );

      Alert.alert('Success', 'User created successfully');
      setCreateModalVisible(false);
      loadUsers();
    } catch (error) {
      console.error('Error creating user:', error);
      Alert.alert('Error', 'Failed to create user');
    } finally {
      setIsCreating(false);
    }
  };

  const renderUser = ({ item }: { item: UserType }) => (
    <View style={styles.userCard}>
      <View style={styles.userInfo}>
        <View style={styles.usernameRow}>
          <Text style={styles.username}>{item.username}</Text>
          <View style={[styles.roleBadge, item.role === 'admin' ? styles.adminBadge : styles.standardBadge]}>
            {item.role === 'admin' ? (
              <Shield size={12} color="#fff" />
            ) : (
              <Users size={12} color="#666" />
            )}
            <Text style={[styles.roleText, item.role === 'admin' ? styles.adminText : styles.standardText]}>
              {item.role === 'admin' ? 'Admin' : 'Standard'}
            </Text>
          </View>
        </View>
        <Text style={styles.email}>{item.email || 'No email'}</Text>
        <Text style={styles.createdDate}>
          Created: {item.createdAt.toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleEditUser(item)}
        >
          <Edit2 size={20} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDeleteUser(item)}
        >
          <Trash2 size={20} color="#ff4444" />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <ArrowLeft size={24} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>Manage Users</Text>
        </View>

        <View style={styles.authContainer}>
          <View style={styles.authCard}>
            <Text style={styles.authTitle}>Admin Access Required</Text>
            <Text style={styles.authSubtitle}>Please authenticate with an admin account</Text>

            <View style={styles.authInputContainer}>
              <View style={styles.inputIcon}>
                <User size={20} color="#666" />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor="#999"
                value={authUsername}
                onChangeText={setAuthUsername}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isAuthenticating}
              />
            </View>

            <View style={styles.authInputContainer}>
              <View style={styles.inputIcon}>
                <Lock size={20} color="#666" />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#999"
                value={authPassword}
                onChangeText={setAuthPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isAuthenticating}
              />
            </View>

            <TouchableOpacity
              style={[styles.authButton, isAuthenticating && styles.authButtonDisabled]}
              onPress={handleAuthenticate}
              disabled={isAuthenticating}
            >
              <Text style={styles.authButtonText}>
                {isAuthenticating ? 'Authenticating...' : 'Authenticate'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <ArrowLeft size={24} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Manage Users</Text>
        <TouchableOpacity style={styles.addButton} onPress={handleOpenCreateModal}>
          <UserPlus size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={users}
        renderItem={renderUser}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={isLoading}
        onRefresh={loadUsers}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No users found</Text>
          </View>
        }
      />

      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Edit User</Text>

              <View style={styles.inputContainer}>
                <View style={styles.inputIcon}>
                  <User size={20} color="#666" />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Username"
                  placeholderTextColor="#999"
                  value={editUsername}
                  onChangeText={setEditUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.inputIcon}>
                  <Mail size={20} color="#666" />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor="#999"
                  value={editEmail}
                  onChangeText={setEditEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.inputIcon}>
                  <User size={20} color="#666" />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Full Name"
                  placeholderTextColor="#999"
                  value={editFullName}
                  onChangeText={setEditFullName}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.inputIcon}>
                  <Lock size={20} color="#666" />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="New Password (leave empty to keep current)"
                  placeholderTextColor="#999"
                  value={editPassword}
                  onChangeText={setEditPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setEditModalVisible(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.saveButton]}
                  onPress={handleSaveUser}
                >
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={createModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Create User</Text>

              <View style={styles.inputContainer}>
                <View style={styles.inputIcon}>
                  <User size={20} color="#666" />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Username"
                  placeholderTextColor="#999"
                  value={newUsername}
                  onChangeText={setNewUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isCreating}
                />
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.inputIcon}>
                  <Mail size={20} color="#666" />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor="#999"
                  value={newEmail}
                  onChangeText={setNewEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  editable={!isCreating}
                />
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.inputIcon}>
                  <User size={20} color="#666" />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Full Name"
                  placeholderTextColor="#999"
                  value={newFullName}
                  onChangeText={setNewFullName}
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!isCreating}
                />
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.inputIcon}>
                  <Lock size={20} color="#666" />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="#999"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isCreating}
                />
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.inputIcon}>
                  <Lock size={20} color="#666" />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Confirm Password"
                  placeholderTextColor="#999"
                  value={newConfirmPassword}
                  onChangeText={setNewConfirmPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isCreating}
                />
              </View>

              <Text style={styles.roleLabel}>User Level</Text>
              <View style={styles.roleButtonsContainer}>
                <TouchableOpacity
                  style={[
                    styles.roleButton,
                    newRole === 'admin' && styles.roleButtonActive,
                    newRole === 'admin' && styles.adminRoleActive,
                  ]}
                  onPress={() => setNewRole('admin')}
                  disabled={isCreating}
                >
                  <Shield size={18} color={newRole === 'admin' ? '#fff' : '#666'} />
                  <Text style={[
                    styles.roleButtonText,
                    newRole === 'admin' && styles.roleButtonTextActive,
                  ]}>
                    Admin
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.roleButton,
                    newRole === 'standard' && styles.roleButtonActive,
                    newRole === 'standard' && styles.standardRoleActive,
                  ]}
                  onPress={() => setNewRole('standard')}
                  disabled={isCreating}
                >
                  <Users size={18} color={newRole === 'standard' ? '#fff' : '#666'} />
                  <Text style={[
                    styles.roleButtonText,
                    newRole === 'standard' && styles.roleButtonTextActive,
                  ]}>
                    Standard
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setCreateModalVisible(false)}
                  disabled={isCreating}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.saveButton, isCreating && styles.buttonDisabled]}
                  onPress={handleCreateUser}
                  disabled={isCreating}
                >
                  <Text style={styles.saveButtonText}>
                    {isCreating ? 'Creating...' : 'Create'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: '#1a1a1a',
  },
  addButton: {
    padding: 4,
  },
  list: {
    padding: 16,
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  userInfo: {
    flex: 1,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  username: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: '#1a1a1a',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 4,
  },
  adminBadge: {
    backgroundColor: Colors.primary,
  },
  standardBadge: {
    backgroundColor: '#e0e0e0',
  },
  roleText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  adminText: {
    color: '#fff',
  },
  standardText: {
    color: '#666',
  },
  email: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  createdDate: {
    fontSize: 12,
    color: '#999',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    backgroundColor: '#ffebee',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: '#1a1a1a',
    marginBottom: 24,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  inputIcon: {
    paddingLeft: 16,
  },
  input: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: '#1a1a1a',
  },
  roleLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#333',
    marginBottom: 12,
  },
  roleButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  roleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    gap: 8,
  },
  roleButtonActive: {
    borderColor: 'transparent',
  },
  adminRoleActive: {
    backgroundColor: Colors.primary,
  },
  standardRoleActive: {
    backgroundColor: '#666',
  },
  roleButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#666',
  },
  roleButtonTextActive: {
    color: '#fff',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  saveButton: {
    backgroundColor: Colors.primary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#666',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#fff',
  },
  authContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  authCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  authTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  authSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  authInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  authButton: {
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  authButtonDisabled: {
    opacity: 0.6,
  },
  authButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#fff',
  },
});
