"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../lib/auth-backend-bridge";

type RoomPriorityType =
  | "homeroom"
  | "study_room"
  | "mamad"
  | "library"
  | "music_room"
  | "caravan"
  | "other"
  | "auditorium";

interface RoomTypeOption {
  key: RoomPriorityType;
  label: string;
}

interface RoomOption {
  id: string;
  room_number: string;
  room_type: string;
  preference_type: RoomPriorityType;
  preference_label: string;
}

interface DefaultSetting {
  room_type: RoomPriorityType;
  room_ids: string[];
}

interface OverrideSetting {
  id: string;
  room_type: RoomPriorityType;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  room_ids: string[];
}

interface SettingsResponse {
  room_types: RoomTypeOption[];
  rooms: RoomOption[];
  settings: {
    defaults: DefaultSetting[];
    overrides: OverrideSetting[];
  };
}

interface MoveFeedback {
  scope: "default" | "override";
  groupId: string;
  roomId: string;
}

const dayLabels: Record<number, string> = {
  0: "ראשון",
  1: "שני",
  2: "שלישי",
  3: "רביעי",
  4: "חמישי",
  5: "שישי",
  6: "שבת",
};

const moveItem = (items: string[], index: number, direction: "up" | "down") => {
  const next = [...items];
  const targetIndex = direction === "up" ? index - 1 : index + 1;

  if (targetIndex < 0 || targetIndex >= next.length) {
    return next;
  }

  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
};

const buildDefaultOrderMap = (
  roomTypes: RoomTypeOption[],
  rooms: RoomOption[],
  defaults: DefaultSetting[]
) => {
  const defaultsMap = new Map(defaults.map((setting) => [setting.room_type, setting.room_ids]));

  return roomTypes.reduce<Record<string, string[]>>((accumulator, roomType) => {
    const roomIdsForType = rooms
      .filter((room) => room.preference_type === roomType.key)
      .map((room) => room.id);
    const preferredIds = defaultsMap.get(roomType.key) || [];
    const remainingIds = roomIdsForType.filter((roomId) => !preferredIds.includes(roomId));

    accumulator[roomType.key] = [
      ...preferredIds.filter((roomId) => roomIdsForType.includes(roomId)),
      ...remainingIds,
    ];

    return accumulator;
  }, {});
};

const buildOverrideDraft = (roomType: RoomPriorityType): OverrideSetting => ({
  id: crypto.randomUUID(),
  room_type: roomType,
  days_of_week: [],
  start_time: "08:00",
  end_time: "14:40",
  room_ids: [],
});

function CompactPriorityCard({
  room,
  index,
  highlighted,
  accent,
  onMoveEarlier,
  onMoveLater,
  disableEarlier,
  disableLater,
}: {
  room: RoomOption;
  index: number;
  highlighted: boolean;
  accent: "amber" | "violet";
  onMoveEarlier: () => void;
  onMoveLater: () => void;
  disableEarlier: boolean;
  disableLater: boolean;
}) {
  const rankLabel =
    index === 0 ? "מוביל" : index === 1 ? "2" : index === 2 ? "3" : `${index + 1}`;

  const accentClasses =
    accent === "amber"
      ? "border-amber-200 bg-gradient-to-b from-amber-50 to-white"
      : "border-violet-200 bg-gradient-to-b from-violet-50 to-white";

  const accentBadge =
    accent === "amber" ? "bg-amber-100 text-amber-800" : "bg-violet-100 text-violet-800";

  return (
    <div
      className={`w-36 shrink-0 rounded-2xl border p-3 transition-all duration-300 ${
        highlighted
          ? "border-emerald-300 bg-emerald-50 shadow-md shadow-emerald-100 ring-2 ring-emerald-200 -translate-y-1"
          : index === 0
            ? accentClasses
            : "border-slate-200 bg-white shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold ${index === 0 ? accentBadge : "bg-slate-100 text-slate-700"}`}>
          {index + 1}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${index === 0 ? accentBadge : "bg-slate-100 text-slate-600"}`}>
          {rankLabel}
        </span>
      </div>

      <div className="mt-3">
        <div className="text-sm font-semibold text-slate-900">{room.room_number}</div>
        <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{room.room_type}</div>
        {highlighted && (
          <div className="mt-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            עודכן
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-1.5">
        <button
          type="button"
          onClick={onMoveEarlier}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-40"
          disabled={disableEarlier}
        >
          קודם
        </button>
        <button
          type="button"
          onClick={onMoveLater}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-40"
          disabled={disableLater}
        >
          אחר כך
        </button>
      </div>
    </div>
  );
}

export default function RoomPrioritiesPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [defaultOrders, setDefaultOrders] = useState<Record<string, string[]>>({});
  const [overrides, setOverrides] = useState<OverrideSetting[]>([]);
  const [selectedType, setSelectedType] = useState<RoomPriorityType | "">("");
  const [moveFeedback, setMoveFeedback] = useState<MoveFeedback | null>(null);

  const isAdmin = session?.user?.role === "admin";

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    if (!isAdmin) {
      setLoading(false);
      return;
    }

    void loadSettings();
  }, [isAdmin, status]);

  useEffect(() => {
    if (!moveFeedback) {
      return;
    }

    const timeout = window.setTimeout(() => setMoveFeedback(null), 1200);
    return () => window.clearTimeout(timeout);
  }, [moveFeedback]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await authenticatedFetch("https://rooms-ma9h.onrender.com/api/room-priorities");
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "טעינת ההגדרות נכשלה");
      }

      const nextData = result.data as SettingsResponse;
      setData(nextData);
      setDefaultOrders(buildDefaultOrderMap(nextData.room_types, nextData.rooms, nextData.settings.defaults));
      setOverrides(nextData.settings.overrides);
      setSelectedType((current) => current || nextData.room_types[0]?.key || "");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "טעינת ההגדרות נכשלה");
    } finally {
      setLoading(false);
    }
  };

  const roomsById = useMemo(
    () => new Map((data?.rooms || []).map((room) => [room.id, room])),
    [data]
  );

  const selectedTypeRooms = useMemo(() => {
    if (!data || !selectedType) {
      return [];
    }

    const orderedIds = defaultOrders[selectedType] || [];
    return orderedIds
      .map((roomId) => roomsById.get(roomId))
      .filter((room): room is RoomOption => Boolean(room));
  }, [data, defaultOrders, roomsById, selectedType]);

  const isRoomHighlighted = (scope: "default" | "override", groupId: string, roomId: string) =>
    moveFeedback?.scope === scope &&
    moveFeedback.groupId === groupId &&
    moveFeedback.roomId === roomId;

  const handleMoveDefaultRoom = (roomType: string, index: number, direction: "up" | "down") => {
    const movedRoomId = defaultOrders[roomType]?.[index];

    setDefaultOrders((current) => ({
      ...current,
      [roomType]: moveItem(current[roomType] || [], index, direction),
    }));

    if (movedRoomId) {
      setMoveFeedback({ scope: "default", groupId: roomType, roomId: movedRoomId });
    }
  };

  const handleMoveOverrideRoom = (overrideId: string, index: number, direction: "up" | "down") => {
    const movedRoomId = overrides.find((override) => override.id === overrideId)?.room_ids[index];

    setOverrides((current) =>
      current.map((override) =>
        override.id === overrideId
          ? { ...override, room_ids: moveItem(override.room_ids, index, direction) }
          : override
      )
    );

    if (movedRoomId) {
      setMoveFeedback({ scope: "override", groupId: overrideId, roomId: movedRoomId });
    }
  };

  const handleOverrideTypeChange = (overrideId: string, roomType: RoomPriorityType) => {
    const roomIdsForType = (data?.rooms || [])
      .filter((room) => room.preference_type === roomType)
      .map((room) => room.id);

    setOverrides((current) =>
      current.map((override) =>
        override.id === overrideId
          ? { ...override, room_type: roomType, room_ids: roomIdsForType }
          : override
      )
    );
  };

  const toggleOverrideDay = (overrideId: string, day: number) => {
    setOverrides((current) =>
      current.map((override) => {
        if (override.id !== overrideId) {
          return override;
        }

        const exists = override.days_of_week.includes(day);
        const nextDays = exists
          ? override.days_of_week.filter((item) => item !== day)
          : [...override.days_of_week, day].sort((left, right) => left - right);

        return { ...override, days_of_week: nextDays };
      })
    );
  };

  const addOverride = () => {
    const roomType = selectedType || data?.room_types[0]?.key;
    if (!roomType || !data) {
      return;
    }

    const roomIdsForType = data.rooms
      .filter((room) => room.preference_type === roomType)
      .map((room) => room.id);

    setOverrides((current) => [...current, { ...buildOverrideDraft(roomType), room_ids: roomIdsForType }]);
  };

  const removeOverride = (overrideId: string) => {
    setOverrides((current) => current.filter((override) => override.id !== overrideId));
  };

  const saveSettings = async () => {
    if (!data) {
      return;
    }

    try {
      setSaving(true);
      setMessage("");

      const defaults = data.room_types.map((roomType) => ({
        room_type: roomType.key,
        room_ids: defaultOrders[roomType.key] || [],
      }));

      const response = await authenticatedFetch("https://rooms-ma9h.onrender.com/api/room-priorities", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaults, overrides }),
      });
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "שמירת ההגדרות נכשלה");
      }

      setMessage("העדפות השיבוץ נשמרו בהצלחה.");
      await loadSettings();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "שמירת ההגדרות נכשלה");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading" || loading) {
    return <div className="min-h-screen bg-slate-50 p-8 text-slate-700">טוען...</div>;
  }

  if (!isAdmin) {
    return <div className="min-h-screen bg-slate-50 p-8 text-slate-700">המסך זמין למנהל בלבד.</div>;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f8fafc,_#eef2ff_45%,_#f8fafc)] p-6" dir="rtl">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-3xl bg-white/95 p-6 shadow-sm ring-1 ring-slate-200 backdrop-blur">
          <h1 className="text-2xl font-bold text-slate-900">העדפות שיבוץ חדרים</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            ההגדרות כאן משפיעות רק על סדר הבחירה בין חדרים שכבר עברו את כל חוקי השיבוץ הקיימים.
          </p>
        </div>

        <div className="grid gap-6">
          <section className="rounded-3xl bg-white/95 p-6 shadow-sm ring-1 ring-slate-200 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">ברירת מחדל לפי סוג חדר</h2>
              </div>
              <select
                value={selectedType}
                onChange={(event) => setSelectedType(event.target.value as RoomPriorityType)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
              >
                {(data?.room_types || []).map((roomType) => (
                  <option key={roomType.key} value={roomType.key}>
                    {roomType.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {selectedTypeRooms.map((room, index) => (
                <CompactPriorityCard
                  key={room.id}
                  room={room}
                  index={index}
                  highlighted={isRoomHighlighted("default", selectedType, room.id)}
                  accent="amber"
                  onMoveEarlier={() => handleMoveDefaultRoom(selectedType, index, "up")}
                  onMoveLater={() => handleMoveDefaultRoom(selectedType, index, "down")}
                  disableEarlier={index === 0}
                  disableLater={index === selectedTypeRooms.length - 1}
                />
              ))}
            </div>
          </section>

          <section className="rounded-3xl bg-white/95 p-6 shadow-sm ring-1 ring-slate-200 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">חריגי שעות</h2>
              </div>
              <button
                type="button"
                onClick={addOverride}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
              >
                הוסף חריג
              </button>
            </div>

            <div className="mt-5 space-y-5">
              {overrides.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  עדיין לא הוגדרו חריגי שעות.
                </div>
              )}

              {overrides.map((override) => {
                const roomTypeRooms = (data?.rooms || []).filter((room) => room.preference_type === override.room_type);
                const overrideRooms = override.room_ids
                  .map((roomId) => roomsById.get(roomId))
                  .filter((room): room is RoomOption => Boolean(room));

                return (
                  <div key={override.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm text-slate-700">
                          סוג חדר
                          <select
                            value={override.room_type}
                            onChange={(event) => handleOverrideTypeChange(override.id, event.target.value as RoomPriorityType)}
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                          >
                            {(data?.room_types || []).map((roomType) => (
                              <option key={roomType.key} value={roomType.key}>
                                {roomType.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-sm text-slate-700">
                            התחלה
                            <input
                              type="time"
                              value={override.start_time}
                              onChange={(event) =>
                                setOverrides((current) =>
                                  current.map((item) =>
                                    item.id === override.id ? { ...item, start_time: event.target.value } : item
                                  )
                                )
                              }
                              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                            />
                          </label>
                          <label className="text-sm text-slate-700">
                            סיום
                            <input
                              type="time"
                              value={override.end_time}
                              onChange={(event) =>
                                setOverrides((current) =>
                                  current.map((item) =>
                                    item.id === override.id ? { ...item, end_time: event.target.value } : item
                                  )
                                )
                              }
                              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                            />
                          </label>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeOverride(override.id)}
                        className="rounded-xl border border-rose-200 px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-50"
                      >
                        מחק
                      </button>
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 text-sm font-medium text-slate-800">ימים רלוונטיים</div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(dayLabels).map(([day, label]) => {
                          const numericDay = Number(day);
                          const isSelected = override.days_of_week.includes(numericDay);

                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => toggleOverrideDay(override.id, numericDay)}
                              className={`rounded-full px-3 py-1 text-xs transition ${
                                isSelected
                                  ? "bg-slate-900 text-white"
                                  : "border border-slate-300 text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <div className="mb-3 text-sm font-medium text-slate-800">תור העדיפות לחריג הזה</div>
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
                        {overrideRooms.map((room, index) => (
                          <CompactPriorityCard
                            key={room.id}
                            room={room}
                            index={index}
                            highlighted={isRoomHighlighted("override", override.id, room.id)}
                            accent="violet"
                            onMoveEarlier={() => handleMoveOverrideRoom(override.id, index, "up")}
                            onMoveLater={() => handleMoveOverrideRoom(override.id, index, "down")}
                            disableEarlier={index === 0}
                            disableLater={index === overrideRooms.length - 1}
                          />
                        ))}
                      </div>

                      {roomTypeRooms.length === 0 && (
                        <div className="mt-2 rounded-2xl border border-dashed border-slate-300 p-3 text-xs text-slate-500">
                          אין חדרים פעילים בסוג הזה כרגע.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white/95 p-4 shadow-sm ring-1 ring-slate-200 backdrop-blur">
          <div className="text-sm text-slate-600">
            {message || "ההגדרות כאן משפיעות רק על מסלול בקשת חדר, ורק עבור משתמש מנהל."}
          </div>
          <button
            type="button"
            onClick={saveSettings}
            disabled={saving}
            className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {saving ? "שומר..." : "שמור הגדרות"}
          </button>
        </div>
      </div>
    </div>
  );
}
