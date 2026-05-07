"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../lib/auth-backend-bridge";
import { getActivityTypeText as getDisplayActivityTypeText } from "@/lib/activityDisplay";

interface RoomStatus {
  room_id: string;
  room_number: string;
  room_type: string;
  floor: number;
  wing: string;
  capacity: number;
  has_projector: boolean;
  is_small: boolean;
  current_status: 'available' | 'occupied' | 'between_classes';
  current_assignment?: {
    id: number;
    study_group_name?: string;
    activity_type: string;
    grade?: string;
    start_time: string;
    end_time: string;
    student_count?: number;
  };
  next_assignment?: {
    start_time: string;
    study_group_name?: string;
    activity_type: string;
  };
  utilization_today: number;
}

export default function RoomsPage() {
  const { data: session } = useSession();
  const [rooms, setRooms] = useState<Array<{
    id: string;
    room_number: string;
    capacity: number;
    room_type: string;
    status: string;
    floor: number;
    wing: string;
    has_projector: boolean;
    availability?: 'free' | 'partial' | 'full';
    assignmentsCount?: number;
  }>>([]);

  const [grades, setGrades] = useState<Array<{
    id: string;
    name: string;
  }>>([]);

  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [roomStatuses, setRoomStatuses] = useState<RoomStatus[]>([]);
  const [statusFilters, setStatusFilters] = useState({
    room_type: '',
    wing: '',
    floor: '',
    status: ''
  });

  useEffect(() => {
    fetchRooms();
    fetchGrades();
    fetchRoomStatus();
    
    // Set up interval for real-time updates
    const interval = setInterval(() => {
      setCurrentTime(new Date());
      fetchRoomStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, [statusFilters]);

  const isAdmin = session?.user?.role === 'admin';
  
  console.log('Session:', session);
  console.log('User role:', session?.user?.role);
  console.log('Is admin:', isAdmin);

  const fetchRoomStatus = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const params = new URLSearchParams({
        start_date: today,
        end_date: today,
        ...(statusFilters.room_type && { room_type: statusFilters.room_type }),
        ...(statusFilters.wing && { wing: statusFilters.wing }),
        ...(statusFilters.floor && { floor: statusFilters.floor })
      });

      const response = await authenticatedFetch(`https://rooms-ma9h.onrender.com/api/calendar/grid?${params}`);
      const data = await response.json();
      
      if (data.success) {
        const processedRooms = processRoomStatus(data.data.rooms, data.data.time_slots, data.data.dates[0]);
        setRoomStatuses(processedRooms);
      }
    } catch (error) {
      console.error('Error fetching room status:', error);
    }
  };

  const processRoomStatus = (roomsData: any[], timeSlots: string[], today: string): RoomStatus[] => {
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentTimeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

    return roomsData.map(room => {
      const todaySchedule = room.schedule[today] || {};
      let currentStatus: 'available' | 'occupied' | 'between_classes' = 'available';
      let currentAssignment: any = null;
      let nextAssignment: any = null;
      let occupiedSlots = 0;

      // Find current and next assignment
      Object.entries(todaySchedule).forEach(([timeSlot, slotData]: [string, any]) => {
        const slotHour = parseInt(timeSlot.split(':')[0]);
        
        if (slotData.is_occupied) {
          occupiedSlots++;
          
          if (!currentAssignment && slotHour <= currentHour) {
            const assignment = slotData.assignment;
            if (assignment) {
              const startHour = parseInt(assignment.start_time.split(':')[0]);
              const startMinute = parseInt(assignment.start_time.split(':')[1]);
              const endHour = parseInt(assignment.end_time.split(':')[0]);
              const endMinute = parseInt(assignment.end_time.split(':')[1]);
              
              const currentTimeInMinutes = currentHour * 60 + currentTime.getMinutes();
              const startTimeInMinutes = startHour * 60 + startMinute;
              const endTimeInMinutes = endHour * 60 + endMinute;
              
              if (currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes < endTimeInMinutes) {
                currentStatus = 'occupied';
                currentAssignment = assignment;
              } else if (currentTimeInMinutes >= endTimeInMinutes && slotHour === endHour) {
                currentStatus = 'between_classes';
              }
            }
          }
          
          if (!nextAssignment && slotHour > currentHour) {
            nextAssignment = slotData.assignment;
          }
        }
      });

      const utilizationToday = timeSlots.length > 0 ? Math.round((occupiedSlots / timeSlots.length) * 100) : 0;

      return {
        room_id: room.room_id,
        room_number: room.room_number,
        room_type: room.room_type,
        floor: room.floor,
        wing: room.wing,
        capacity: room.capacity,
        has_projector: room.has_projector,
        is_small: room.is_small,
        current_status: currentStatus,
        current_assignment: currentAssignment,
        next_assignment: nextAssignment,
        utilization_today: utilizationToday
      };
    });
  };

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const response = await authenticatedFetch('https://rooms-ma9h.onrender.com/api/rooms');
      const data = await response.json();
      
      if (data.success) {
        const roomsData = data.data.rooms;
        
        // Check availability for each room for today
        const today = new Date().toISOString().split('T')[0];
        const roomsWithAvailability = await Promise.all(
          roomsData.map(async (room: any) => {
            try {
              const availabilityResponse = await authenticatedFetch(
                `https://rooms-ma9h.onrender.com/api/rooms/${room.id}/availability?date=${today}`
              );
              const availabilityData = await availabilityResponse.json();
              
              const assignments = availabilityData.data.assignments || [];
              const assignmentsCount = assignments.length;
              
              let availability: 'free' | 'partial' | 'full';
              
              if (assignmentsCount === 0) {
                availability = 'free'; // No assignments at all
              } else {
                // Check if assignments cover the whole day (8AM-6PM = 10 hours)
                const totalHoursCovered = assignments.reduce((total: number, assignment: any) => {
                  // This is a simplified calculation - in reality we'd need start/end times
                  return total + 2; // Assume each assignment is 2 hours
                }, 0);
                
                if (totalHoursCovered >= 8) {
                  availability = 'full'; // Covers most of the day
                } else {
                  availability = 'partial'; // Covers part of the day
                }
              }
              
              return { ...room, availability, assignmentsCount };
            } catch (error) {
              console.error('Error checking availability for room:', room.id);
              return { ...room, availability: 'free', assignmentsCount: 0 };
            }
          })
        );
        
        setRooms(roomsWithAvailability);
      } else {
        console.error('Failed to fetch rooms:', data.error);
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGrades = async () => {
    try {
      const response = await authenticatedFetch('https://rooms-ma9h.onrender.com/api/rooms/grades');
      const data = await response.json();
      
      if (data.success) {
        console.log('Grades fetched:', data.data.grades);
        setGrades(data.data.grades || []);
      } else {
        console.error('Failed to fetch grades:', data.error);
      }
    } catch (error) {
      console.error('Error fetching grades:', error);
    }
  };

  const handleAddRoom = () => {
    console.log('handleAddRoom called');
    // Create a modal-like dialog for room creation
    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    dialog.innerHTML = `
      <div class="bg-white p-6 rounded-lg shadow-xl max-w-2xl w-full max-h-screen overflow-y-auto">
        <h3 class="text-lg font-bold mb-4">הוספת חדר חדש</h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">מספר חדר:</label>
            <input type="text" id="roomNumber" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="הכנס מספר חדר">
            <p class="text-xs text-gray-500 mt-1">הקומה והאגף ייקבעו אוטומטית לפי מספר החדר</p>
          </div>
          
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">תכולת חדר:</label>
            <input type="number" id="capacity" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="הכנס תכולת חדר">
          </div>
          
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">קומה:</label>
            <input type="number" id="floor" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="הכנס מספר קומה" value="1">
            <p class="text-xs text-gray-500 mt-1">ייקבע אוטומטית לפי מספר החדר</p>
          </div>
          
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">אגף:</label>
            <select id="wing" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="old">אגף ישן</option>
              <option value="new">אגף חדש</option>
            </select>
            <p class="text-xs text-gray-500 mt-1">ייקבע אוטומטית לפי מספר החדר</p>
          </div>
        </div>
        
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">סוג חדר:</label>
          <select id="roomType" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">בחר סוג חדר</option>
            <option value="HOMEROOM">כיתה אם</option>
            <option value="MAMAD">חדר ממ"ד</option>
            <option value="MUSIC">חדר מוזיקה</option>
            <option value="LIBRARY">ספרייה</option>
            <option value="AUDITORIUM">אודיטוריום</option>
            <option value="CARAVAN">קראוון</option>
            <option value="CLASSROOM_A">כיתה א'</option>
            <option value="CLASSROOM_B">כיתה ב'</option>
            <option value="CLASSROOM_C">כיתה ג'</option>
            <option value="CLASSROOM_D">כיתה ד'</option>
            <option value="CLASSROOM_E">כיתה ה'</option>
            <option value="CLASSROOM_F">כיתה ו'</option>
            <option value="CLASSROOM_G">כיתה ז'</option>
            <option value="CLASSROOM_H">כיתה ח'</option>
            <option value="CLASSROOM_I">כיתה ט'</option>
            <option value="CLASSROOM_J">כיתה י'</option>
            <option value="CLASSROOM_K">כיתה י"א</option>
            <option value="CLASSROOM_L">כיתה י"ב</option>
            <option value="ENGLISH_PAIRS">אנגלית זוגות</option>
            <option value="study_room">חדר הקבצה</option>
          </select>
        </div>
        
        <div class="mb-4">
          <label class="flex items-center">
            <input type="checkbox" id="hasProjector" class="ml-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
            <span class="text-sm font-medium text-gray-700">האם יש מקרן בחדר?</span>
          </label>
        </div>
        
        <div class="flex justify-end space-x-2 space-x-reverse">
          <button id="cancelBtn" class="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors">ביטול</button>
          <button id="addBtn" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">הוסף חדר</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    const roomNumberInput = dialog.querySelector('#roomNumber') as HTMLInputElement;
    const capacityInput = dialog.querySelector('#capacity') as HTMLInputElement;
    const floorInput = dialog.querySelector('#floor') as HTMLInputElement;
    const wingSelect = dialog.querySelector('#wing') as HTMLSelectElement;
    const roomTypeSelect = dialog.querySelector('#roomType') as HTMLSelectElement;
    const hasProjectorCheckbox = dialog.querySelector('#hasProjector') as HTMLInputElement;
    const cancelBtn = dialog.querySelector('#cancelBtn') as HTMLButtonElement;
    const addBtn = dialog.querySelector('#addBtn') as HTMLButtonElement;
    
    // Function to determine room location from room number
    const getRoomLocation = (roomNumber: string) => {
      if (!roomNumber || roomNumber.length < 3) {
        return { floor: '', wing: '', roomType: '' };
      }
      
      const floor = roomNumber[0];
      const middleDigit = roomNumber[1];
      const lastDigit = roomNumber[roomNumber.length - 1];
      
      // Determine floor
      let floorValue = '';
      if (floor >= '1' && floor <= '4') {
        floorValue = floor;
      }
      
      // Determine wing - handle ALL possible middle digits
      let wingValue = '';
      if (middleDigit === '0') {
        wingValue = 'old'; // MAMAD - old wing
      } else if (middleDigit === '1' || middleDigit === '2') {
        wingValue = 'old';
      } else if (middleDigit === '3' || middleDigit === '4') {
        wingValue = 'new';
      } else if (middleDigit === '5' || middleDigit === '6' || middleDigit === '7' || middleDigit === '8' || middleDigit === '9') {
        wingValue = 'old'; // Default other digits to old wing
      }
      
      // Determine room type for MAMAD
      let roomTypeValue = '';
      if (middleDigit === '0') {
        roomTypeValue = 'MAMAD';
      }
      
      return { floor: floorValue, wing: wingValue, roomType: roomTypeValue };
    };

    // Add room number input event listener for auto-determination
    roomNumberInput.addEventListener('input', () => {
      const roomNumber = roomNumberInput.value.trim();
      const location = getRoomLocation(roomNumber);
      
      // Auto-fill floor for all valid room numbers
      if (location.floor) {
        floorInput.value = location.floor;
      }
      
      // Auto-fill wing for all valid room numbers
      if (location.wing) {
        wingSelect.value = location.wing;
      }
      
      // Auto-fill room type only for MAMAD if not already selected
      if (location.roomType && !roomTypeSelect.value) {
        roomTypeSelect.value = location.roomType;
      }
      
      // Show auto-determination indicator
      if (location.floor || location.wing || location.roomType) {
        roomNumberInput.style.borderColor = '#10b981'; // Green border for successful auto-detection
      } else {
        roomNumberInput.style.borderColor = ''; // Reset border color
      }
    });
    
    const closeModal = () => {
      document.body.removeChild(dialog);
    };
    
    cancelBtn.addEventListener('click', closeModal);
    
    addBtn.addEventListener('click', () => {
      const roomNumber = roomNumberInput.value.trim();
      const capacity = parseInt(capacityInput.value);
      const floor = parseInt(floorInput.value);
      const wing = wingSelect.value;
      const roomType = roomTypeSelect.value;
      const hasProjector = hasProjectorCheckbox.checked;
      
      if (!roomNumber || !capacity || !floor || !wing || !roomType) {
        alert('אנא מלא את כל השדות הנדרשים');
        return;
      }
      
      addRoom(roomNumber, capacity, roomType, floor, wing, hasProjector);
      closeModal();
    });
    
    // Close modal when clicking outside
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        closeModal();
      }
    });
  };

  // Helper function to get room type display name
  const getRoomTypeDisplay = (roomType: string) => {
    const typeMap: { [key: string]: string } = {
      'HOMEROOM': 'כיתה אם',
      'MAMAD': 'חדר ממ"ד',
      'MUSIC': 'חדר מוזיקה',
      'LIBRARY': 'ספרייה',
      'AUDITORIUM': 'אודיטוריום',
      'CARAVAN': 'קראוון',
      'CLASSROOM_A': 'כיתה א\'',
      'CLASSROOM_B': 'כיתה ב\'',
      'CLASSROOM_C': 'כיתה ג\'',
      'CLASSROOM_D': 'כיתה ד\'',
      'CLASSROOM_E': 'כיתה ה\'',
      'CLASSROOM_F': 'כיתה ו\'',
      'CLASSROOM_G': 'כיתה ז\'',
      'CLASSROOM_H': 'כיתה ח\'',
      'CLASSROOM_I': 'כיתה ט\'',
      'CLASSROOM_J': 'כיתה י\'',
      'CLASSROOM_K': 'כיתה י"א',
      'CLASSROOM_L': 'כיתה י"ב',
      'ENGLISH_PAIRS': 'אנגלית זוגות',
      'study_room': 'הקבצה'
    };
    
    return typeMap[roomType] || roomType;
  };

  const addRoom = async (
    roomNumber: string, 
    capacity: number, 
    roomType: string, 
    floor: number, 
    wing: string,
    hasProjector: boolean = false,
    assignAsHomeroom: boolean = false,
    homeroomAssignments: Array<{gradeId: string, classNumber: number, maxStudents: number, schoolYear: number}> = []
  ) => {
    try {
      const response = await authenticatedFetch('https://rooms-ma9h.onrender.com/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomNumber,
          capacity,
          roomType,
          floor,
          wing,
          hasProjector,
          isSmall: false,
          assignAsHomeroom,
          homeroomAssignments: assignAsHomeroom ? homeroomAssignments : undefined
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        const homeroomCount = data.data.homerooms?.length || 0;
        let message = 'חדר נוסף בהצלחה!';
        if (homeroomCount > 0) {
          message += ` נוצרו גם ${homeroomCount} כיתות אם.`;
        }
        alert(message);
        fetchRooms(); // Refresh list
      } else {
        alert(`שגיאה: ${data.error}`);
      }
    } catch (error) {
      console.error('Error adding room:', error);
      alert('אירעה שגיאה בהוספת החדר');
    }
  };

  const handleEditRoom = (roomId: string) => {
    // Find the room data - first try rooms array, then roomStatuses
    let room = rooms.find(r => r.id === roomId);
    if (!room) {
      const roomStatus = roomStatuses.find(r => r.room_id === roomId);
      if (roomStatus) {
        // Transform RoomStatus to match expected room type
        room = {
          id: roomStatus.room_id,
          room_number: roomStatus.room_number,
          capacity: roomStatus.capacity,
          room_type: roomStatus.room_type,
          status: roomStatus.current_status,
          floor: roomStatus.floor,
          wing: roomStatus.wing,
          has_projector: roomStatus.has_projector,
          availability: roomStatus.current_status === 'available' ? 'free' : 
                       roomStatus.current_status === 'occupied' ? 'full' : 'partial',
          assignmentsCount: roomStatus.current_assignment ? 1 : 0
        };
      }
    }
    if (!room) {
      alert('חדר לא נמצא');
      return;
    }

    // Create edit dialog
    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    dialog.innerHTML = `
      <div class="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
        <h3 class="text-lg font-bold mb-4">עריכת חדר: ${room.room_number}</h3>
        
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">תכולת חדר:</label>
          <input type="number" id="editCapacity" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" value="${room.capacity}">
        </div>
        
        <div class="mb-6">
          <label class="flex items-center">
            <input type="checkbox" id="editHasProjector" class="ml-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500" ${room.has_projector ? 'checked' : ''}>
            <span class="text-sm font-medium text-gray-700">האם יש מקרן בחדר?</span>
          </label>
        </div>
        
        <div class="flex justify-end space-x-2 space-x-reverse">
          <button id="cancelEditBtn" class="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors">ביטול</button>
          <button id="saveEditBtn" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">שמור</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    const capacityInput = dialog.querySelector('#editCapacity') as HTMLInputElement;
    const hasProjectorCheckbox = dialog.querySelector('#editHasProjector') as HTMLInputElement;
    const cancelBtn = dialog.querySelector('#cancelEditBtn') as HTMLButtonElement;
    const saveBtn = dialog.querySelector('#saveEditBtn') as HTMLButtonElement;
    
    const closeEditDialog = () => {
      document.body.removeChild(dialog);
    };
    
    cancelBtn.addEventListener('click', closeEditDialog);
    
    saveBtn.addEventListener('click', () => {
      const newCapacity = parseInt(capacityInput.value);
      const hasProjector = hasProjectorCheckbox.checked;
      
      if (!newCapacity || newCapacity <= 0) {
        alert('אנא הכנס תכולה חוקית');
        return;
      }
      
      updateRoom(roomId, { 
        capacity: newCapacity,
        has_projector: hasProjector 
      });
      closeEditDialog();
    });
    
    // Close dialog when clicking outside
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        closeEditDialog();
      }
    });
  };

  const updateRoom = async (roomId: string, updates: any) => {
    try {
      const response = await authenticatedFetch(`https://rooms-ma9h.onrender.com/api/rooms/${roomId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });

      const data = await response.json();
      
      if (data.success) {
        alert('חדר עודכן בהצלחה!');
        fetchRooms(); // Refresh list
      } else {
        alert(`שגיאה: ${data.error}`);
      }
    } catch (error) {
      console.error('Error updating room:', error);
      alert('אירעה שגיאה בעדכון החדר');
    }
  };

  const handleDeleteRoom = (roomId: string) => {
    if (confirm('האם אתה בטוח שברצונך למחוק חדר זה?')) {
      deleteRoom(roomId);
    }
  };

  const deleteRoom = async (roomId: string) => {
    try {
      const response = await authenticatedFetch(`https://rooms-ma9h.onrender.com/api/rooms/${roomId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        alert('חדר נמחק בהצלחה!');
        fetchRooms(); // Refresh list
      } else {
        alert(`שגיאה: ${data.error}`);
      }
    } catch (error) {
      console.error('Error deleting room:', error);
      alert('אירעה שגיאה במחיקת החדר');
    }
  };

  // Helper function to get availability display
  const getAvailabilityDisplay = (availability?: string, assignmentsCount?: number) => {
    switch (availability) {
      case 'free':
        return { text: 'פנוי כל היום', color: 'bg-green-100 text-green-800' };
      case 'partial':
        return { text: `תפוס חלקית (${assignmentsCount} הקצאות)`, color: 'bg-yellow-100 text-yellow-800' };
      case 'full':
        return { text: 'תפוס כל היום', color: 'bg-red-100 text-red-800' };
      default:
        return { text: 'לא ידוע', color: 'bg-gray-100 text-gray-800' };
    }
  };

  const getRoomStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-500';
      case 'occupied': return 'bg-red-500';
      case 'between_classes': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };
  const getActivityTypeText = (type: string) => getDisplayActivityTypeText(type);

  const getRoomTypeText = (type: string) => {
    const types: Record<string, string> = {
      'homeroom_a': 'א',
      'homeroom_b': 'ב',
      'homeroom_c': 'ג',
      'homeroom_d': 'ד',
      'homeroom_e': 'ה',
      'homeroom_f': 'ו',
      'computer_lab': 'ממ"ד',
      'study_room': 'הקבצה',
      'ENGLISH_PAIRS': 'אנגלית זוגות',
      'music_room': 'מוזיקה',
      'auditorium': 'אולם',
      'library': 'ספריה',
      'corridor': 'קרוון'
    };
    return types[type] || type;
  };

  const filteredRoomStatuses = roomStatuses.filter(room => {
    if (statusFilters.status && room.current_status !== statusFilters.status) return false;
    return true;
  });

  const statusSummary = {
    total: filteredRoomStatuses.length,
    available: filteredRoomStatuses.filter(r => r.current_status === 'available').length,
    occupied: filteredRoomStatuses.filter(r => r.current_status === 'occupied').length,
    between_classes: filteredRoomStatuses.filter(r => r.current_status === 'between_classes').length
  };

  // Group rooms by floor for better organization
  const roomsByFloor = filteredRoomStatuses.reduce((acc, room) => {
    if (!acc[room.floor]) acc[room.floor] = [];
    acc[room.floor].push(room);
    return acc;
  }, {} as Record<number, RoomStatus[]>);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800';
      case 'RESERVED':
        return 'bg-yellow-100 text-yellow-800';
      case 'DISABLED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'פעיל';
      case 'INACTIVE':
        return 'לא פעיל';
      default:
        return status;
    }
  };

  const getCurrentAssignmentDisplay = (room: any) => {
    const roomStatus = roomStatuses.find(rs => rs.room_id === room.id);
    if (!roomStatus) {
      return '-';
    }
    
    if (roomStatus.current_status === 'occupied' && roomStatus.current_assignment) {
      const assignment = roomStatus.current_assignment;
      const startTime = assignment.start_time;
      const endTime = assignment.end_time;
      const studyGroupName = assignment.study_group_name;
      
      return `${startTime}-${endTime}: ${studyGroupName}`;
    } else if (roomStatus.current_status === 'between_classes') {
      return 'בין שיעורים';
    } else {
      return 'פנוי';
    }
  };

  const getCurrentStatusColor = (room: any) => {
    const roomStatus = roomStatuses.find(rs => rs.room_id === room.id);
    if (!roomStatus) {
      return 'bg-gray-100 text-gray-800';
    }
    
    switch (roomStatus.current_status) {
      case 'available':
        return 'bg-green-100 text-green-800';
      case 'occupied':
        return 'bg-red-100 text-red-800';
      case 'between_classes':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getCurrentStatusText = (room: any) => {
    const roomStatus = roomStatuses.find(rs => rs.room_id === room.id);
    if (!roomStatus) {
      return 'לא ידוע';
    }
    
    switch (roomStatus.current_status) {
      case 'available':
        return 'פנוי';
      case 'occupied':
        return 'תפוס';
      case 'between_classes':
        return 'בין שיעורים';
      default:
        return roomStatus.current_status;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-lg text-gray-600">טוען...</div>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">ניהול חדרים</h1>
              <p className="text-gray-600">צפייה בחדרים פעילים, סטטוס זמינות וניהול את השיבוצים</p>
            </div>

            {/* Room Status Section */}
            <div className="mb-8">
              <div className="bg-white shadow rounded-lg p-4 mb-4">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">סטטוס חדרים חי</h2>
                    <div className="text-sm text-gray-600">
                      {currentTime.toLocaleDateString('he-IL')} • {currentTime.toLocaleTimeString('he-IL')}
                    </div>
                  </div>
                  <button
                    onClick={fetchRoomStatus}
                    className="px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700"
                  >
                    רענן
                  </button>
                </div>

                {/* Status Filters */}
                <div className="flex items-center gap-2 mb-4">
                  <select
                    value={statusFilters.room_type}
                    onChange={(e) => setStatusFilters({...statusFilters, room_type: e.target.value})}
                    className="px-2 py-1 border border-gray-300 rounded text-xs"
                  >
                    <option value="">כל הסוגים</option>
                    <option value="computer_lab">ממ"ד</option>
                    <option value="study_room">הקבצה</option>
                    <option value="ENGLISH_PAIRS">אנגלית זוגות</option>
                    <option value="music_room">מוזיקה</option>
                    <option value="auditorium">אולם</option>
                    <option value="library">ספריה</option>
                  </select>
                  
                  <select
                    value={statusFilters.wing}
                    onChange={(e) => setStatusFilters({...statusFilters, wing: e.target.value})}
                    className="px-2 py-1 border border-gray-300 rounded text-xs"
                  >
                    <option value="">כל האגפים</option>
                    <option value="old">ישן</option>
                    <option value="new">חדש</option>
                  </select>
                  
                  <select
                    value={statusFilters.floor}
                    onChange={(e) => setStatusFilters({...statusFilters, floor: e.target.value})}
                    className="px-2 py-1 border border-gray-300 rounded text-xs"
                  >
                    <option value="">כל הקומות</option>
                    <option value="1">קומה 1</option>
                    <option value="2">קומה 2</option>
                    <option value="3">קומה 3</option>
                    <option value="4">קומה 4</option>
                  </select>

                  <select
                    value={statusFilters.status}
                    onChange={(e) => setStatusFilters({...statusFilters, status: e.target.value})}
                    className="px-2 py-1 border border-gray-300 rounded text-xs"
                  >
                    <option value="">כל הסטטוסים</option>
                    <option value="available">פנוי</option>
                    <option value="occupied">תפוס</option>
                    <option value="between_classes">בין שיעורים</option>
                  </select>
                </div>

                {/* Status Summary */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  <div className="bg-gray-50 p-2 rounded text-center">
                    <div className="text-lg font-bold text-gray-900">{statusSummary.total}</div>
                    <div className="text-xs text-gray-600">סה"כ</div>
                  </div>
                  <div className="bg-gray-50 p-2 rounded text-center">
                    <div className="text-lg font-bold text-green-600">{statusSummary.available}</div>
                    <div className="text-xs text-gray-600">פנויים</div>
                  </div>
                  <div className="bg-gray-50 p-2 rounded text-center">
                    <div className="text-lg font-bold text-red-600">{statusSummary.occupied}</div>
                    <div className="text-xs text-gray-600">תפוסים</div>
                  </div>
                  <div className="bg-gray-50 p-2 rounded text-center">
                    <div className="text-lg font-bold text-yellow-600">{statusSummary.between_classes}</div>
                    <div className="text-xs text-gray-600">בין שיעורים</div>
                  </div>
                </div>

                {/* Compact Room Grid */}
                <div className="bg-gray-50 rounded-lg overflow-x-auto">
                  {Object.entries(roomsByFloor)
                    .sort(([a], [b]) => parseInt(a) - parseInt(b))
                    .map(([floor, floorRooms]) => (
                      <div key={floor} className="border-b border-gray-200 last:border-b-0">
                        {/* Floor Header */}
                        <div className="bg-white px-2 py-1 text-sm font-medium text-gray-700 sticky right-0 z-10">
                          קומה {floor}
                        </div>
                        
                        {/* Rooms Row */}
                        <div className="flex flex-nowrap gap-1 p-2">
                          {floorRooms.map((room: RoomStatus) => (
                            <div 
                              key={room.room_id} 
                              className="flex-shrink-0 w-24 border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow bg-white"
                            >
                              {/* Room Header */}
                              <div className="bg-gray-50 p-1 border-b border-gray-200">
                                <div className="text-xs font-semibold text-center truncate">{room.room_number}</div>
                                <div className="text-xs text-center text-gray-600">{getRoomTypeText(room.room_type)}</div>
                              </div>
                              
                              {/* Status Indicator */}
                              <div className={`h-3 ${getRoomStatusColor(room.current_status)}`}></div>
                              
                              {/* Room Details */}
                              <div className="p-1 space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span>תפוסה:</span>
                                  <span>{room.capacity}</span>
                                </div>
                                {room.has_projector && (
                                  <div className="text-xs text-blue-600 text-center">📽</div>
                                )}
                                
                                {room.current_assignment && (
                                  <div className="text-xs p-1 bg-red-50 rounded border border-red-200">
                                    <div className="font-medium text-red-800 truncate">
                                      {room.current_assignment.study_group_name || getActivityTypeText(room.current_assignment.activity_type)}
                                    </div>
                                    <div className="text-red-600">
                                      {room.current_assignment.start_time}-{room.current_assignment.end_time}
                                    </div>
                                    {room.current_assignment.grade && (
                                      <div className="text-red-600">שכבה {room.current_assignment.grade}</div>
                                    )}
                                  </div>
                                )}

                                {room.next_assignment && room.current_status !== 'occupied' && (
                                  <div className="text-xs p-1 bg-blue-50 rounded border border-blue-200">
                                    <div className="font-medium text-blue-800 truncate">
                                      {room.next_assignment.study_group_name || getActivityTypeText(room.next_assignment.activity_type)}
                                    </div>
                                    <div className="text-blue-600">מ-{room.next_assignment.start_time}</div>
                                  </div>
                                )}

                                <div className="flex justify-between text-xs">
                                  <span>ניצולת:</span>
                                  <span className={`font-medium ${room.utilization_today > 80 ? 'text-red-600' : room.utilization_today > 50 ? 'text-yellow-600' : 'text-green-600'}`}>
                                    {room.utilization_today}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>

                {/* Status Legend */}
                <div className="mt-3 bg-gray-50 rounded-lg p-2">
                  <div className="flex items-center justify-center gap-4 text-xs">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-green-500 rounded"></div>
                      <span>פנוי</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-red-500 rounded"></div>
                      <span>תפוס</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                      <span>בין שיעורים</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-gray-500 rounded"></div>
                      <span>לא ידוע</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Room Management Section */}
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-medium text-gray-900">ניהול חדרים</h2>
                  {isAdmin && (
                    <button 
                      onClick={handleAddRoom}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                    >
                      הוסף חדר חדש
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          שם חדר
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          קיבולת
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          סוג חדר
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          זמינות
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          סטטוס
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          שיבוץ נוכחי
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          פעולות
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {rooms.map((room) => (
                        <tr key={room.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {room.room_number}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {room.capacity} תלמידים
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {getRoomTypeDisplay(room.room_type)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getAvailabilityDisplay(room.availability, room.assignmentsCount).color}`}>
                              {getAvailabilityDisplay(room.availability, room.assignmentsCount).text}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getCurrentStatusColor(room)}`}>
                              {getCurrentStatusText(room)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {getCurrentAssignmentDisplay(room)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            {isAdmin && (
                              <>
                                <button 
                                  onClick={() => handleEditRoom(room.id)}
                                  className="text-indigo-600 hover:text-indigo-900 ml-3"
                                >
                                  ערוך
                                </button>
                                <button 
                                  onClick={() => handleDeleteRoom(room.id)}
                                  className="text-red-600 hover:text-red-900"
                                >
                                  מחק
                                </button>
                              </>
                            )}
                            {!isAdmin && (
                              <span className="text-gray-400">אין הרשאות</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
          </> 
        )}
      </div>
    </div>
  );
}
