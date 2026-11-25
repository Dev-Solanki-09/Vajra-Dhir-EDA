/*
    Published under the standard MIT License.
*/

export interface ProjectPage {
    document: unknown;
    sheet_path: string;
}

export interface Project {
    active_page?: ProjectPage | null;
    root_schematic_page?: ProjectPage | null;
    resolve_text_var?: (name: string) => string | undefined;
    settings?: Record<string, unknown>;
}
