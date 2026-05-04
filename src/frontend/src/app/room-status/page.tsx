"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../lib/auth-backend-bridge";

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

export default function RoomStatusPage() {
  const { data: session } = useSession();
  const [rooms, setRooms] = useState<RoomStatus[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [filters, setFilters] = useState({
    room_type: '',
    wing: '',
    floor: '',
    status: ''
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRoomStatus();
    const interval = setInterval(() => {
      setCurrentTime(new Date());
      fetchRoomStatus();
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [filters]);

  const fetchRoomStatus = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      
      const params = new URLSearchParams({
        start_date: today,
        end_date: today,
        ...(filters.room_type && { room_type: filters.room_type }),
        ...(filters.wing && { wing: filters.wing }),
        ...(filters.floor && { floor: filters.floor })
      });

      const response = await authenticatedFetch(`http://localhost:3001/api/calendar/grid?${params}`);
      const data = await response.json();
      
      if (data.success) {
        const processedRooms = processRoomStatus(data.data.rooms, data.data.time_slots, data.data.dates[0]);
        setRooms(processedRooms);
      }
    } catch (error) {
      console.error('Error fetching room status:', error);
    } finally {
      setLoading(false);
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
              const endHour = parseInt(assignment.end_time.split(':')[0]);
              
              if (currentHour >= startHour && currentHour < endHour) {
                currentStatus = 'occupied';
                currentAssignment = assignment;
              } else if (currentHour >= endHour && slotHour === endHour) {
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-800 border-green-200';
      case 'occupied': return 'bg-red-100 text-red-800 border-red-200';
      case 'between_classes': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'available': return 'פנוי';
      case 'occupied': return 'תפוס';
      case 'between_classes': return 'בין שיעורים';
      default: return 'לא ידוע';
    }
  };

  const getActivityTypeText = (type: string) => {
    const types: Record<string, string> = {
      'study_group': 'הקבצה',
      'regular_class': 'שיעור רגיל',
      'meeting': 'מפגש',
      'event': 'מפגש / אירוע',
      'one_on_one': 'אחד על אחד',
      'personal_meeting': 'אחד על אחד',
      'discussion': 'שיח',
      'topics': 'סוגיות',
      'discussion_topics': 'שיח / סוגיות',
      'didactics': 'דידקטיקה',
      'exam_makeup': 'השלמת מבחנים',
      'high_school_pe': 'התעמלות תיכון',
      'homeroom': 'כיתת אם'
    };
    return types[type] || type;
  };

  const getRoomTypeText = (type: string) => {
    const types: Record<string, string> = {
      'homeroom_a': 'כיתת אם א',
      'homeroom_b': 'כיתת אם ב',
      'homeroom_c': 'כיתת אם ג',
      'homeroom_d': 'כיתת אם ד',
      'homeroom_e': 'כיתת אם ה',
      'homeroom_f': 'כיתת אם ו',
      'computer_lab': 'ממ"ד',
      'study_room': 'חדר הקבצה',
      'music_room': 'חדר מוזיקה',
      'auditorium': 'אולם גדול',
      'library': 'ספריה',
      'corridor': 'קרוון'
    };
    return types[type] || type;
  };

  const filteredRooms = rooms.filter(room => {
    if (filters.status && room.current_status !== filters.status) return false;
    return true;
  });

  const summary = {
    total: filteredRooms.length,
    available: filteredRooms.filter(r => r.current_status === 'available').length,
    occupied: filteredRooms.filter(r => r.current_status === 'occupied').length,
    between_classes: filteredRooms.filter(r => r.current_status === 'between_classes').length
  };

  // Group rooms by floor for better organization
  const roomsByFloor = filteredRooms.reduce((acc, room) => {
    if (!acc[room.floor]) acc[room.floor] = [];
    acc[room.floor].push(room);
    return acc;
  }, {} as Record<number, RoomStatus[]>);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">טוען...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-full mx-auto py-4 px-2">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900 mb-1">סטטוס חדרים חי</h1>
          <div className="text-sm text-gray-600">
            {currentTime.toLocaleDateString('he-IL')} • {currentTime.toLocaleTimeString('he-IL')}
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white shadow rounded-lg p-3 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <select
                value={filters.room_type}
                onChange={(e) => setFilters({...filters, room_type: e.target.value})}
                className="px-2 py-1 border border-gray-300 rounded text-xs"
              >
                <option value="">כל הסוגים</option>
                <option value="computer_lab">ממ"ד</option>
                <option value="study_room">הקבצה</option>
                <option value="music_room">מוזיקה</option>
                <option value="auditorium">אולם</option>
                <option value="library">ספריה</option>
              </select>
              
              <select
                value={filters.wing}
                onChange={(e) => setFilters({...filters, wing: e.target.value})}
                className="px-2 py-1 border border-gray-300 rounded text-xs"
              >
                <option value="">כל האגפים</option>
                <option value="old">ישן</option>
                <option value="new">חדש</option>
              </select>
              
              <select
                value={filters.floor}
                onChange={(e) => setFilters({...filters, floor: e.target.value})}
                className="px-2 py-1 border border-gray-300 rounded text-xs"
              >
                <option value="">כל הקומות</option>
                <option value="1">קומה 1</option>
                <option value="2">קומה 2</option>
                <option value="3">קומה 3</option>
                <option value="4">קומה 4</option>
              </select>

              <select
                value={filters.status}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
                className="px-2 py-1 border border-gray-300 rounded text-xs"
              >
                <option value="">כל הסטטוסים</option>
                <option value="available">פנוי</option>
                <option value="occupied">תפוס</option>
                <option value="between_classes">בין שיעורים</option>
              </select>
            </div>

            <button
              onClick={fetchRoomStatus}
              className="px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700"
            >
              רענן
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="bg-white p-2 rounded shadow text-center">
            <div className="text-lg font-bold text-gray-900">{summary.total}</div>
            <div className="text-xs text-gray-600">סה"כ</div>
          </div>
          <div className="bg-white p-2 rounded shadow text-center">
            <div className="text-lg font-bold text-green-600">{summary.available}</div>
            <div className="text-xs text-gray-600">פנויים</div>
          </div>
          <div className="bg-white p-2 rounded shadow text-center">
            <div className="text-lg font-bold text-red-600">{summary.occupied}</div>
            <div className="text-xs text-gray-600">תפוסים</div>
          </div>
          <div className="bg-white p-2 rounded shadow text-center">
            <div className="text-lg font-bold text-yellow-600">{summary.between_classes}</div>
            <div className="text-xs text-gray-600">בין שיעורים</div>
          </div>
        </div>

        {/* Compact Room Grid - Side by Side */}
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          {Object.entries(roomsByFloor)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([floor, floorRooms]) => (
              <div key={floor} className="border-b last:border-b-0">
                {/* Floor Header */}
                <div className="bg-gray-100 px-2 py-1 text-sm font-medium text-gray-700 sticky right-0 z-10">
                  קומה {floor}
                </div>
                
                {/* Rooms Row */}
                <div className="flex flex-nowrap gap-1 p-2">
                  {floorRooms.map((room: RoomStatus) => (
                    <div 
                      key={room.room_id} 
                      className="flex-shrink-0 w-24 border rounded-lg overflow-hidden hover:shadow-md transition-shadow"
                    >
                      {/* Room Header */}
                      <div className="bg-gray-50 p-1 border-b">
                        <div className="text-xs font-semibold text-center truncate">{room.room_number}</div>
                        <div className="text-xs text-center text-gray-600">{getRoomTypeText(room.room_type)}</div>
                      </div>
                      
                      {/* Status Indicator */}
                      <div className={`h-3 ${getStatusColor(room.current_status)}`}></div>
                      
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

        {filteredRooms.length === 0 && (
          <div className="text-center py-8">
            <div className="text-gray-500">לא נמצאו חדרים התואמים את הסינון</div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 bg-white rounded-lg shadow p-3">
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
  );
}
