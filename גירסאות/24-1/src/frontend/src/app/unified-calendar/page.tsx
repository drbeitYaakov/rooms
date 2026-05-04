"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../lib/auth-backend-bridge";

interface CalendarCell {
  room_id: string;
  date: string;
  time_slot: string;
  is_occupied: boolean;
  assignment?: {
    id: number;
    study_group_name?: string;
    activity_type: string;
    grade?: string;
    start_time: string;
    end_time: string;
    student_count?: number;
  };
}

interface Room {
  room_id: string;
  room_number: string;
  room_type: string;
  floor: number;
  wing: string;
  capacity: number;
  has_projector: boolean;
  is_small: boolean;
  schedule?: Record<string, Record<string, any>>;
}

export default function UnifiedCalendarPage() {
  const { data: session } = useSession();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [calendarData, setCalendarData] = useState<CalendarCell[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    room_type: '',
    wing: '',
    floor: ''
  });

  useEffect(() => {
    fetchCalendarData();
  }, [selectedWeek, filters]);

  const fetchCalendarData = async () => {
    try {
      setLoading(true);
      
      // Calculate week start and end dates
      const weekStart = new Date(selectedWeek);
      const day = weekStart.getDay();
      const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
      weekStart.setDate(diff);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      const startDate = weekStart.toISOString().split('T')[0];
      const endDate = weekEnd.toISOString().split('T')[0];
      
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        ...(filters.room_type && { room_type: filters.room_type }),
        ...(filters.wing && { wing: filters.wing }),
        ...(filters.floor && { floor: filters.floor })
      });

      const response = await authenticatedFetch(`http://localhost:3001/api/calendar/grid?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setRooms(data.data.rooms);
        
        // Convert the nested schedule structure to flat calendar cells
        const flatCalendarData: CalendarCell[] = [];
        data.data.rooms.forEach((room: any) => {
          Object.entries(room.schedule).forEach(([date, timeSlots]: [string, any]) => {
            Object.entries(timeSlots).forEach(([timeSlot, slotData]: [string, any]) => {
              flatCalendarData.push({
                room_id: room.room_id,
                date,
                time_slot: timeSlot,
                is_occupied: slotData.is_occupied,
                assignment: slotData.assignment
              });
            });
          });
        });
        
        setCalendarData(flatCalendarData);
      }
    } catch (error) {
      console.error('Error fetching calendar data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getWeekDays = () => {
    const weekStart = new Date(selectedWeek);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    weekStart.setDate(diff);
    
    const days = [];
    // Only include Sunday-Friday (exclude Saturday)
    for (let i = 0; i < 6; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      days.push({
        date: date.toISOString().split('T')[0],
        dayName: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'][i],
        dayNumber: date.getDate()
      });
    }
    return days;
  };

  const getTimeSlots = () => {
    const slots = [];
    // Extended hours: 8:00 - 22:00 with 30-minute intervals
    for (let hour = 8; hour <= 22; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
      if (hour < 22) { // Don't add 22:30 since we end at 22:00
        slots.push(`${hour.toString().padStart(2, '0')}:30`);
      }
    }
    return slots;
  };

  const getCellData = (roomId: string, date: string, timeSlot: string) => {
    if (!calendarData || !Array.isArray(calendarData)) return undefined;
    return calendarData.find(cell => 
      cell.room_id === roomId && 
      cell.date === date && 
      cell.time_slot === timeSlot
    );
  };

  const getRoomAssignmentsForDay = (roomId: string, date: string) => {
    if (!calendarData || !Array.isArray(calendarData)) return [];
    
    const roomAssignments = calendarData.filter(cell => 
      cell.room_id === roomId && 
      cell.date === date && 
      cell.is_occupied && 
      cell.assignment
    );
    
    // Group by assignment to avoid duplicates
    const uniqueAssignments = roomAssignments.reduce((acc, cell) => {
      const assignment = cell.assignment;
      if (!assignment) return acc;
      
      const key = `${assignment.id}-${assignment.start_time}-${assignment.end_time}`;
      
      if (!acc[key]) {
        acc[key] = {
          ...assignment,
          room_id: roomId,
          date: date
        };
      }
      
      return acc;
    }, {} as Record<string, any>);
    
    return Object.values(uniqueAssignments);
  };

  const getActivityTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'study_group': 'bg-blue-100 text-blue-800 border-blue-200',
      'regular_class': 'bg-green-100 text-green-800 border-green-200',
      'meeting': 'bg-purple-100 text-purple-800 border-purple-200',
      'exam': 'bg-red-100 text-red-800 border-red-200',
      'event': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'לימודים': 'bg-orange-100 text-orange-800 border-orange-200' // Default homeroom color
    };
    return colors[type] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getActivityTypeText = (type: string) => {
    const types: Record<string, string> = {
      'study_group': 'הקבצה',
      'regular_class': 'שיעור רגיל',
      'meeting': 'פגישה',
      'exam': 'מבחן',
      'event': 'אירוע',
      'לימודים': 'כיתת אם (דיפולט)' // Default homeroom text
    };
    return types[type] || type;
  };

  const getRoomTypeDisplay = (roomType: string) => {
    const types: Record<string, string> = {
      'CLASSROOM_A': 'כיתת אם א\'',
      'CLASSROOM_B': 'כיתת אם ב\'',
      'CLASSROOM_C': 'כיתת אם ג\'',
      'CLASSROOM_D': 'כיתת אם ד\'',
      'CLASSROOM_E': 'כיתת אם ה\'',
      'CLASSROOM_F': 'כיתת אם ו\'',
      'computer_lab': 'ממ"ד',
      'study_room': 'חדר הקבצה',
      'music_room': 'חדר מוזיקה',
      'auditorium': 'אולם גדול',
      'library': 'ספריה'
    };
    return types[roomType] || roomType;
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newWeek = new Date(selectedWeek);
    const days = direction === 'prev' ? -7 : 7;
    newWeek.setDate(newWeek.getDate() + days);
    setSelectedWeek(newWeek);
  };

  const weekDays = getWeekDays();
  const timeSlots = getTimeSlots();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">טוען...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="w-full mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">לוח שנה מאוחד</h1>
            
            {/* Controls */}
            <div className="bg-white shadow rounded-lg p-6 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() - 7 * 24 * 60 * 60 * 1000))}
                    className="px-4 py-2 hover:bg-gray-100 rounded-md text-sm font-medium"
                  >
                    ◀
                  </button>
                  <span className="text-lg font-medium">
                    {weekDays[0]?.dayName} {weekDays[0]?.dayNumber} - {weekDays[weekDays.length - 1]?.dayName} {weekDays[weekDays.length - 1]?.dayNumber}
                  </span>
                  <button
                    onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() + 7 * 24 * 60 * 60 * 1000))}
                    className="px-4 py-2 hover:bg-gray-100 rounded-md text-sm font-medium"
                  >
                    ▶
                  </button>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center justify-between gap-4">
                <select
                  value={filters.room_type}
                  onChange={(e) => setFilters({...filters, room_type: e.target.value})}
                  className="px-4 py-2 border border-gray-300 rounded text-sm"
                >
                  <option value="">כל הסוגים</option>
                  <option value="CLASSROOM_A">כיתות אם א'</option>
                  <option value="CLASSROOM_B">כיתות אם ב'</option>
                  <option value="CLASSROOM_C">כיתות אם ג'</option>
                  <option value="CLASSROOM_D">כיתות אם ד'</option>
                  <option value="CLASSROOM_E">כיתות אם ה'</option>
                  <option value="CLASSROOM_F">כיתות אם ו'</option>
                  <option value="computer_lab">ממ"ד</option>
                  <option value="study_room">חדר הקבצה</option>
                </select>
                
                <select
                  value={filters.wing}
                  onChange={(e) => setFilters({...filters, wing: e.target.value})}
                  className="px-4 py-2 border border-gray-300 rounded text-sm"
                >
                  <option value="">כל האגפים</option>
                  <option value="old">אגף ישן</option>
                  <option value="new">אגף חדש</option>
                </select>
                
                <select
                  value={filters.floor}
                  onChange={(e) => setFilters({...filters, floor: e.target.value})}
                  className="px-4 py-2 border border-gray-300 rounded text-sm"
                >
                  <option value="">כל הקומות</option>
                  <option value="1">קומה 1</option>
                  <option value="2">קומה 2</option>
                  <option value="3">קומה 3</option>
                  <option value="4">קומה 4</option>
                  <option value="5">קומה 5</option>
                  <option value="6">קומה 6</option>
                </select>
              </div>
            </div>
          </div>

          {/* Timeline Calendar */}
          {loading ? (
            <div className="bg-white shadow rounded-lg p-12 text-center">
              <div className="text-gray-600 text-lg">טוען...</div>
            </div>
          ) : (
            <div className="bg-white shadow rounded-lg overflow-x-auto">
              {/* Header with days */}
              <div className="flex border-b min-w-[7000px]">
                <div className="p-4 bg-gray-50 text-right text-base font-medium text-gray-700 w-64 border-l border-r">
                  חדר
                </div>
                {weekDays.map((day, index) => (
                  <div key={day.date} className="p-4 bg-gray-50 text-center min-w-[1400px] border-l border-r">
                    <div className="text-base text-gray-600">{day.dayName}</div>
                    <div className="text-base text-gray-600">{day.dayNumber}</div>
                  </div>
                ))}
              </div>
              
              {/* Timeline View */}
              <div className="divide-y min-w-[7000px]">
                {rooms.map((room) => (
                  <div key={room.room_id} className="flex min-h-[50px] relative">
                    {/* Room info */}
                    <div className="p-4 bg-gray-50 text-right text-sm border-l border-r w-64">
                      <div className="font-semibold text-gray-900 text-lg">{room.room_number}</div>
                      <div className="text-gray-600">{getRoomTypeDisplay(room.room_type)}</div>
                      <div className="text-gray-500">קומה {room.floor}</div>
                      {room.has_projector && (
                        <div className="text-sm text-blue-600">📽</div>
                      )}
                    </div>
                    
                    {/* Timeline for each day */}
                    {weekDays.map((day, index) => (
                      <div key={`${room.room_id}-${day.date}`} className="relative border-l border-r border-t border-gray-200 p-4 min-h-[50px] min-w-[1400px]">
                        {/* Timeline axis */}
                        <div className="absolute left-0 right-0 top-0 bottom-0">
                          {/* Hour markers */}
                          {Array.from({ length: 15 }, (_, i) => {
                            const hour = 8 + i;
                            // Reverse the calculation for RTL: 8:00 on the right, 22:00 on the left
                            const leftPosition = ((22 - hour) / 14) * 100;
                            return (
                              <div
                                key={hour}
                                className="absolute top-0 bottom-0 w-1 bg-gray-600"
                                style={{ left: `${leftPosition}%` }}
                              >
                                <div className="absolute -top-2 -right-4 text-sm text-gray-900 font-bold whitespace-nowrap bg-white px-2 py-1 border border-gray-600 rounded shadow">
                                  {hour}:00
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* Background for occupied time */}
                        {(() => {
                          const assignments = getRoomAssignmentsForDay(room.room_id, day.date);
                          return assignments.map((assignment) => {
                            const [startHour, startMinute] = assignment.start_time.split(':').map(Number);
                            const [endHour, endMinute] = assignment.end_time.split(':').map(Number);
                            
                            const startMinutes = (startHour - 8) * 60 + startMinute;
                            const endMinutes = (endHour - 8) * 60 + endMinute;
                            const totalMinutes = 14 * 60; // 8:00 to 22:00
                            
                            // Reverse the calculation for RTL: 8:00 on the right, 22:00 on the left
                            const leftPosition = ((totalMinutes - endMinutes) / totalMinutes) * 100;
                            const widthPosition = ((endMinutes - startMinutes) / totalMinutes) * 100;
                            
                            return (
                              <div
                                key={`bg-${assignment.id}`}
                                className="absolute top-0 bottom-0 bg-red-100 opacity-80 border border-red-300"
                                style={{
                                  left: `${leftPosition}%`,
                                  width: `${widthPosition}%`,
                                  zIndex: 1
                                }}
                              />
                            );
                          });
                        })()}
                        
                        {/* Assignments as timeline blocks */}
                        {(() => {
                          const assignments = getRoomAssignmentsForDay(room.room_id, day.date);
                          return assignments.map((assignment) => {
                            const [startHour, startMinute] = assignment.start_time.split(':').map(Number);
                            const [endHour, endMinute] = assignment.end_time.split(':').map(Number);
                            
                            const startMinutes = (startHour - 8) * 60 + startMinute;
                            const endMinutes = (endHour - 8) * 60 + endMinute;
                            const totalMinutes = 14 * 60; // 8:00 to 22:00
                            
                            // Reverse the calculation for RTL: 8:00 on the right, 22:00 on the left
                            const leftPosition = ((totalMinutes - endMinutes) / totalMinutes) * 100;
                            const widthPosition = ((endMinutes - startMinutes) / totalMinutes) * 100;
                            
                            return (
                              <div
                                key={assignment.id}
                                className={`absolute top-3 h-12 rounded text-sm p-2 truncate border ${getActivityTypeColor(assignment.activity_type)}`}
                                style={{
                                  left: `${leftPosition}%`,
                                  width: `${widthPosition}%`,
                                  zIndex: 10,
                                  minWidth: '150px'
                                }}
                                title={`${assignment.study_group_name || getActivityTypeText(assignment.activity_type)} (${assignment.start_time}-${assignment.end_time})`}
                              >
                                <div className="truncate font-bold text-base">
                                  {assignment.study_group_name || getActivityTypeText(assignment.activity_type)}
                                </div>
                                <div className="text-xs opacity-75">
                                  {assignment.start_time}-{assignment.end_time}
                                </div>
                              </div>
                            );
                          });
                        })()}
                        
                        {/* End time markers */}
                        {(() => {
                          const assignments = getRoomAssignmentsForDay(room.room_id, day.date);
                          return assignments.map((assignment) => {
                            const [endHour, endMinute] = assignment.end_time.split(':').map(Number);
                            const endMinutes = (endHour - 8) * 60 + endMinute;
                            const totalMinutes = 14 * 60;
                            // Reverse the calculation for RTL: 8:00 on the right, 22:00 on the left
                            const leftPosition = ((totalMinutes - endMinutes) / totalMinutes) * 100;
                            
                            return (
                              <div
                                key={`end-${assignment.id}`}
                                className="absolute top-16 bottom-0 w-1 bg-red-600"
                                style={{ 
                                  left: `${leftPosition}%`,
                                  zIndex: 20
                                }}
                              >
                                <div className="absolute -top-6 -right-6 text-xs text-red-700 font-bold bg-white px-2 py-1 border border-red-600 rounded shadow">
                                  {assignment.end_time}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="mt-8 bg-white shadow rounded-lg p-6">
            <h3 className="text-base font-medium text-gray-900 mb-4">מקרא</h3>
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-blue-100 border border-blue-200 rounded"></div>
                <span className="text-sm text-gray-600">הקבצה</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-green-100 border border-green-200 rounded"></div>
                <span className="text-sm text-gray-600">שיעור רגיל</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-orange-100 border border-orange-200 rounded"></div>
                <span className="text-sm text-gray-600">כיתת אם (דיפולט)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-purple-100 border border-purple-200 rounded"></div>
                <span className="text-sm text-gray-600">פגישה</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-red-100 border border-red-200 rounded"></div>
                <span className="text-sm text-gray-600">מבחן</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-yellow-100 border border-yellow-200 rounded"></div>
                <span className="text-sm text-gray-600">אירוע</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
