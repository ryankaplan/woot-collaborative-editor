/**
 * This header is very incomplete. It's an API only for the functions I'm using.
 */

declare var DIFF_DELETE: number;
declare var DIFF_INSERT: number;
declare var DIFF_EQUAL: number;

declare class diff_match_patch {
    // each inner any is a list of [DIFF_ENUM_VALUE: string]
    diff_main(oldString: string, newString: string): Array<Array<any>>;
}