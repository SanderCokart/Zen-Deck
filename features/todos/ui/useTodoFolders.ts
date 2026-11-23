import {
  parseTodoFolderState,
  sameTodoFolderState,
  TODO_FOLDERS_STORAGE_KEY,
  type TodoFolderState,
} from "@/features/todos/model/todo-folders";
import { type StoredStateCache, useStoredValue } from "@/shared/ui/hooks/useStoredValue";

/**
 * Named todo-column folders, kept in `storage.local`. Folder names survive a
 * reinstall via the settings backup; member tab IDs are session-scoped and
 * simply go unused once those tabs are gone.
 */
export function useTodoFolders(cache?: StoredStateCache): {
  state: TodoFolderState;
  setState: (next: TodoFolderState) => void;
  loaded: boolean;
} {
  const { value, set, loaded } = useStoredValue<TodoFolderState>(
    TODO_FOLDERS_STORAGE_KEY,
    parseTodoFolderState,
    cache,
    { label: "todo folders", isEqual: sameTodoFolderState },
  );
  return { state: value, setState: set, loaded };
}
