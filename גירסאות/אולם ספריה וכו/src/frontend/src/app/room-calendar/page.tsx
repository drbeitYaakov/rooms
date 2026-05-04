"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../lib/auth-backend-bridge";

interface RoomSchedule {
  room_id: string;
  room_number: string;
  room_type: string;
  floor: number;
  wing: string;
  capacity: number;
  has_projector: boolean;
  is_small: boolean;
  schedule: Record<string, Record<string, {
    is_occupied: boolean;
    assignment: {
      id: number;
      study_group_name?: string;
      assignment_title?: string;
      assignment_note?: string | null;
      activity_type: string;
      grade?: string;
      start_time: string;
      end_time: string;
      student_count?: number;
    } | null;
  }>>;
}

interface CalendarData {
  dates: string[];
  time_slots: string[];
  rooms: RoomSchedule[];
  summary: {
    total_rooms: number;
    date_range: {
      start: string;
      end: string;
    };
  };
}

export default function RoomCalendarPage() {
  const { data: session } = useSession();
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [filters, setFilters] = useState({
    room_type: '',
    wing: '',
    floor: ''
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCalendarData();
  }, [selectedDate, viewMode, filters]);

  const fetchCalendarData = async () => {
    try {
      setLoading(true);
      
      let startDate = new Date(selectedDate);
      let endDate = new Date(selectedDate);
      
      if (viewMode === 'week') {
        const dayOfWeek = startDate.getDay();
        const diff = startDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        startDate.setDate(diff);
        endDate.setDate(startDate.getDate() + 6);
      }

      const params = new URLSearchParams({
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        ...(filters.room_type && { room_type: filters.room_type }),
        ...(filters.wing && { wing: filters.wing }),
        ...(filters.floor && { floor: filters.floor })
      });

      const response = await authenticatedFetch(`http://localhost:3001/api/calendar/grid?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setCalendarData(data.data);
      }
    } catch (error) {
      console.error('Error fetching calendar data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'study_group': 'bg-blue-500 text-white',
      'regular_class': 'bg-green-500 text-white',
      'meeting': 'bg-purple-500 text-white',
      'exam': 'bg-red-500 text-white',
      'event': 'bg-yellow-500 text-white',
      'homeroom': 'bg-indigo-500 text-white'
    };
    return colors[type] || 'bg-gray-500 text-white';
  };

  const getActivityTypeText = (type: string) => {
    const types: Record<string, string> = {
      'study_group': 'הקבצה',
      'regular_class': 'שיעור רגיל',
      'meeting': 'פגישה',
      'exam': 'מבחן',
      'event': 'אירוע',
      'homeroom': 'כיתת אם'
    };
    return types[type] || type;
  };

  const getDayName = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' });
  };

  const handlePrevPeriod = () => {
    const newDate = new Date(selectedDate);
    if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setDate(newDate.getDate() - 1);
    }
    setSelectedDate(newDate.toISOString().split('T')[0]);
  };

  const handleNextPeriod = () => {
    const newDate = new Date(selectedDate);
    if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setSelectedDate(newDate.toISOString().split('T')[0]);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">טוען...</div>
      </div>
    );
  }

  if (!calendarData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">שגיאה בטעינת הנתונים</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-full mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">לוח זמנים - תצוגת חדרים</h1>
            
            {/* Controls */}
            <div className="bg-white shadow rounded-lg p-4 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setViewMode('day')}
                      className={`px-3 py-1 rounded-md text-sm font-medium ${
                        viewMode === 'day' 
                          ? 'bg-indigo-600 text-white' 
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      יום
                    </button>
                    <button
                      onClick={() => setViewMode('week')}
                      className={`px-3 py-1 rounded-md text-sm font-medium ${
                        viewMode === 'week' 
                          ? 'bg-indigo-600 text-white' 
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      שבוע
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrevPeriod}
                      className="p-2 hover:bg-gray-100 rounded-md"
                    >
                      ◀
                    </button>
                    <span className="text-sm font-medium">
                      {viewMode === 'week' 
                        ? `${new Date(calendarData.dates[0]).toLocaleDateString('he-IL')} - ${new Date(calendarData.dates[calendarData.dates.length - 1]).toLocaleDateString('he-IL')}`
                        : new Date(selectedDate).toLocaleDateString('he-IL')
                      }
                    </span>
                    <button
                      onClick={handleNextPeriod}
                      className="p-2 hover:bg-gray-100 rounded-md"
                    >
                      ▶
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <select
                    value={filters.room_type}
                    onChange={(e) => setFilters({...filters, room_type: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">כל סוגי החדרים</option>
                    <option value="homeroom_a">כיתת אם א</option>
                    <option value="homeroom_b">כיתת אם ב</option>
                    <option value="homeroom_c">כיתת אם ג</option>
                    <option value="homeroom_d">כיתת אם ד</option>
                    <option value="homeroom_e">כיתת אם ה</option>
                    <option value="homeroom_f">כיתת אם ו</option>
                    <option value="computer_lab">ממ"ד</option>
                    <option value="study_room">חדר הקבצה</option>
                    <option value="music_room">חדר מוזיקה</option>
                    <option value="auditorium">אולם גדול</option>
                    <option value="library">ספריה</option>
                  </select>
                  
                  <select
                    value={filters.wing}
                    onChange={(e) => setFilters({...filters, wing: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">כל האגפים</option>
                    <option value="old">אגף ישן</option>
                    <option value="new">אגף חדש</option>
                  </select>
                  
                  <select
                    value={filters.floor}
                    onChange={(e) => setFilters({...filters, floor: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">כל הקומות</option>
                    <option value="1">קומה 1</option>
                    <option value="2">קומה 2</option>
                    <option value="3">קומה 3</option>
                    <option value="4">קומה 4</option>
                  </select>
                  
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-white shadow rounded-lg p-4 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-indigo-600">{calendarData.summary.total_rooms}</div>
                  <div className="text-sm text-gray-600">סה"כ חדרים</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{calendarData.dates.length}</div>
                  <div className="text-sm text-gray-600">ימים מוצגים</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600">{calendarData.time_slots.length}</div>
                  <div className="text-sm text-gray-600">משבצות זמן</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-600">
                    {calendarData.rooms.filter(r => 
                      Object.values(r.schedule).some(day => 
                        Object.values(day).some(slot => !slot.is_occupied)
                      )
                    ).length}
                  </div>
                  <div className="text-sm text-gray-600">חדרים פנויים</div>
                </div>
              </div>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="bg-white shadow rounded-lg overflow-auto">
            <div className="min-w-[1200px]">
              {/* Header Row */}
              <div className="grid grid-cols-12 gap-0 border-b bg-gray-50 sticky top-0 z-10">
                <div className="col-span-2 p-3 text-right text-xs font-medium text-gray-500 border-l">
                  חדר
                </div>
                {calendarData.dates.map(date => (
                  <div key={date} className="p-3 text-center text-xs font-medium text-gray-500 border-l">
                    <div>{getDayName(date)}</div>
                    <div className="text-xs text-gray-400">{date.split('-').reverse().join('/')}</div>
                  </div>
                ))}
              </div>
              
              {/* Room Rows */}
              {calendarData.rooms.map(room => (
                <div key={room.room_id} className="border-b">
                  <div className="contents">
                    {/* Room Info */}
                    <div className="col-span-2 p-3 bg-gray-50 text-right border-l">
                      <div className="font-medium text-sm">{room.room_number}</div>
                      <div className="text-xs text-gray-600">{getRoomTypeText(room.room_type)}</div>
                      <div className="text-xs text-gray-500">
                        קומה {room.floor} • אגף {room.wing === 'new' ? 'חדש' : 'ישן'} • תפוסה {room.capacity}
                      </div>
                      {room.has_projector && (
                        <div className="text-xs text-blue-600">📽 מקרן</div>
                      )}
                    </div>
                    
                    {/* Schedule Cells */}
                    {calendarData.dates.map(date => (
                      <div key={`${room.room_id}-${date}`} className="border-l p-1 min-h-[400px]">
                        <div className="space-y-1">
                          {calendarData.time_slots.map(timeSlot => {
                            const slot = room.schedule[date]?.[timeSlot];
                            if (!slot) return null;
                            
                            return (
                              <div
                                key={timeSlot}
                                className={`text-xs p-1 rounded min-h-[18px] ${
                                  slot.is_occupied && slot.assignment
                                    ? getActivityTypeColor(slot.assignment.activity_type)
                                    : 'bg-green-100 text-green-800 border border-green-200'
                                }`}
                                title={slot.is_occupied && slot.assignment 
                                  ? `${slot.assignment.assignment_title || slot.assignment.study_group_name || getActivityTypeText(slot.assignment.activity_type)} (${slot.assignment.start_time}-${slot.assignment.end_time})${slot.assignment.assignment_note ? ` - ${slot.assignment.assignment_note}` : ''}`
                                  : `פנוי - ${timeSlot}`
                                }
                              >
                                {slot.is_occupied && slot.assignment ? (
                                  <div className="truncate">
                                    {slot.assignment.assignment_title || slot.assignment.study_group_name || getActivityTypeText(slot.assignment.activity_type)}
                                    {slot.assignment.grade && (
                                      <span className="block text-xs opacity-75">שכבה {slot.assignment.grade}</span>
                                    )}
                                    {slot.assignment.assignment_note && (
                                      <span className="block text-xs opacity-75">{slot.assignment.assignment_note}</span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-xs opacity-75">{timeSlot}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-6 bg-white shadow rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">מקרא</h3>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-100 border border-green-200 rounded"></div>
                <span className="text-xs text-gray-600">פנוי</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded"></div>
                <span className="text-xs text-gray-600">הקבצה</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded"></div>
                <span className="text-xs text-gray-600">שיעור רגיל</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-purple-500 rounded"></div>
                <span className="text-xs text-gray-600">פגישה</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded"></div>
                <span className="text-xs text-gray-600">מבחן</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                <span className="text-xs text-gray-600">אירוע</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-indigo-500 rounded"></div>
                <span className="text-xs text-gray-600">כיתת אם</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
