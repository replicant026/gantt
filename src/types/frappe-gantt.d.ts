declare module "frappe-gantt" {
  export interface FrappeTask {
    id: string;
    name: string;
    start: string;
    end: string;
    progress?: number;
    dependencies?: string | string[];
    custom_class?: string;
    description?: string;
  }

  export interface FrappePopupContext {
    task: FrappeTask & {
      actual_duration: number;
      _start: Date;
      _end: Date;
    };
    chart: {
      options: {
        language: string;
      };
    };
    set_title: (html: string) => void;
    set_subtitle: (html: string) => void;
    set_details: (html: string) => void;
  }

  export interface FrappeOptions {
    readonly?: boolean;
    readonly_progress?: boolean;
    readonly_dates?: boolean;
    move_dependencies?: boolean;
    view_mode?: string;
    view_modes?: Array<string | { name: string }>;
    language?: string;
    today_button?: boolean;
    scroll_to?: string | null;
    popup?: (ctx: FrappePopupContext) => void;
    on_click?: (task: FrappeTask) => void;
    on_double_click?: (task: FrappeTask) => void;
    on_date_change?: (task: FrappeTask, start: Date, end: Date) => void;
    on_view_change?: (mode: string) => void;
  }

  export default class Gantt {
    constructor(
      element: HTMLElement | SVGElement | string,
      tasks: FrappeTask[],
      options?: FrappeOptions,
    );

    refresh(tasks: FrappeTask[]): void;
    change_view_mode(mode?: string, maintain_pos?: boolean): void;
    update_options(options: Partial<FrappeOptions>): void;
    clear(): void;
  }
}
