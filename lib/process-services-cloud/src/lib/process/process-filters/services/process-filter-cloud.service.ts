/*!
 * @license
 * Copyright 2019 Alfresco Software, Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { IdentityUserService, IdentityUserModel } from '@alfresco/adf-core';
import { Injectable, Inject } from '@angular/core';
import { Observable, of, BehaviorSubject, throwError } from 'rxjs';
import { ProcessFilterCloudModel } from '../models/process-filter-cloud.model';
import { switchMap, map, catchError } from 'rxjs/operators';
import { PROCESS_FILTERS_SERVICE_TOKEN } from '../../../services/cloud-token.service';
import { PreferenceCloudServiceInterface } from '../../../services/preference-cloud.interface';
@Injectable({
    providedIn: 'root'
})
export class ProcessFilterCloudService {

    private filtersSubject: BehaviorSubject<ProcessFilterCloudModel[]>;
    filters$: Observable<ProcessFilterCloudModel[]>;

    constructor(
        @Inject(PROCESS_FILTERS_SERVICE_TOKEN) public preferenceService: PreferenceCloudServiceInterface,
        private identityUserService: IdentityUserService) {
        this.filtersSubject = new BehaviorSubject([]);
        this.filters$ = this.filtersSubject.asObservable();
    }

    /**
     * Creates and returns the default process instance filters for a app.
     * @param appName Name of the target app
     * @returns Observable of default process instance filters just created or created filters
     */
    private createDefaultFilters(appName: string) {
        const key: string = this.prepareKey(appName);
        this.preferenceService.getPreferences(appName, key).pipe(
            switchMap((response: any) => {
                const preferences = (response && response.list && response.list.entries) ? response.list.entries : [];
                if (!this.hasPreferences(preferences)) {
                    return this.createProcessFilters(appName, key, this.defaultProcessFilters(appName));
                } else if (!this.hasProcessFilters(preferences, key)) {
                    return this.createProcessFilters(appName, key, this.defaultProcessFilters(appName));
                } else {
                    return of(this.findFiltersByKeyInPreferences(preferences, key));
                }
            }),
            catchError((err) => this.handleProcessError(err))
        ).subscribe((filters) => {
            this.addFiltersToStream(filters);
        });
    }

    /**
     * Gets all process instance filters for a process app.
     * @param appName Name of the target app
     * @returns Observable of process filters details
     */
    getProcessFilters(appName: string): Observable<ProcessFilterCloudModel[]> {
        this.createDefaultFilters(appName);
        return this.filters$;
    }

    /**
     * Get process instance filter for given filter id
     * @param appName Name of the target app
     * @param id Id of the target process instance filter
     * @returns Observable of process instance filter details
     */
    getFilterById(appName: string, id: string): Observable<ProcessFilterCloudModel> {
        const key: string = this.prepareKey(appName);
        return this.getProcessFiltersByKey(appName, key).pipe(
            switchMap((filters: ProcessFilterCloudModel[]) => {
                if (filters && filters.length === 0) {
                    return this.createProcessFilters(appName, key, this.defaultProcessFilters(appName));
                } else {
                    return of(filters);
                }
            }),
            map((filters: ProcessFilterCloudModel[]) => {
                return filters.filter((filter: ProcessFilterCloudModel) => {
                    return filter.id === id;
                })[0];
            }),
            catchError((err) => this.handleProcessError(err))
            );
    }

    /**
     * Adds a new process instance filter
     * @param filter The new filter to add
     * @returns Observable of process instance filters with newly added filter
     */
    addFilter(newFilter: ProcessFilterCloudModel): Observable<ProcessFilterCloudModel[]> {
        const key: string = this.prepareKey(newFilter.appName);
        return this.getProcessFiltersByKey(newFilter.appName, key).pipe(
            switchMap((filters: ProcessFilterCloudModel[]) => {
                if (filters && filters.length === 0) {
                    return this.createProcessFilters(newFilter.appName, key, [newFilter]);
                } else {
                    filters.push(newFilter);
                    return this.preferenceService.updatePreference(newFilter.appName, key, filters);
                }
            }),
            map((filters: ProcessFilterCloudModel[]) => {
                this.addFiltersToStream(filters);
                return filters;
            }),
            catchError((err) => this.handleProcessError(err))
        );
    }

    /**
     *  Update process instance filter
     * @param filter The new filter to update
     * @returns Observable of process instance filters with updated filter
     */
    updateFilter(updatedFilter: ProcessFilterCloudModel): Observable<ProcessFilterCloudModel[]> {
        const key: string = this.prepareKey(updatedFilter.appName);
        return this.getProcessFiltersByKey(updatedFilter.appName, key).pipe(
            switchMap((filters: any) => {
                if (filters && filters.length === 0) {
                    return this.createProcessFilters(updatedFilter.appName, key, [updatedFilter]);
                } else {
                    const itemIndex = filters.findIndex((filter: ProcessFilterCloudModel) => filter.id === updatedFilter.id);
                    filters[itemIndex] = updatedFilter;
                    return this.updateProcessFilters(updatedFilter.appName, key, filters);
                }
            }),
            map((updatedFilters: ProcessFilterCloudModel[]) => {
                this.addFiltersToStream(updatedFilters);
                return updatedFilters;
            }),
            catchError((err) => this.handleProcessError(err))
        );
    }

    /**
     *  Delete process instance filter
     * @param filter The new filter to delete
     * @returns Observable of process instance filters without deleted filter
     */
    deleteFilter(deletedFilter: ProcessFilterCloudModel): Observable<ProcessFilterCloudModel[]> {
        const key = this.prepareKey(deletedFilter.appName);
        return this.getProcessFiltersByKey(deletedFilter.appName, key).pipe(
            switchMap((filters: any) => {
                if (filters && filters.length > 0) {
                    filters = filters.filter((filter: ProcessFilterCloudModel) => filter.id !== deletedFilter.id);
                    return this.updateProcessFilters(deletedFilter.appName, key, filters);
                }
            }),
            map((filters: ProcessFilterCloudModel[]) => {
                this.addFiltersToStream(filters);
                return filters;
            }),
            catchError((err) => this.handleProcessError(err))
        );
    }

    /**
     * Checks user preference are empty or not
     * @param preferences User preferences of the target app
     * @returns Boolean value if the preferences are not empty
     */
    private hasPreferences(preferences: any): boolean {
        return preferences && preferences.length > 0;
    }

    /**
     * Checks for process instance filters in given user preferences
     * @param preferences User preferences of the target app
     * @param key Key of the process instance filters
     * @param filters Details of create filter
     * @returns Boolean value if the preference has process instance filters
     */
    private hasProcessFilters(preferences: any, key: string): boolean {
        const filters = preferences.find((filter: any) => { return filter.entry.key === key; });
        return (filters && filters.entry) ? JSON.parse(filters.entry.value).length > 0 : false;
    }

    /**
     * Calls create preference api to create process instance filters
     * @param appName Name of the target app
     * @param key Key of the process instance filters
     * @param filters Details of new process instance filter
     * @returns Observable of created process instance filters
     */
    private createProcessFilters(appName: string, key: string, filters: ProcessFilterCloudModel[]): Observable<ProcessFilterCloudModel[]> {
        return this.preferenceService.createPreference(appName, key, filters);
    }

    /**
     * Calls get preference api to get process instance filter by preference key
     * @param appName Name of the target app
     * @param key Key of the process instance filters
     * @returns Observable of process instance filters
     */
    private getProcessFiltersByKey(appName: string, key: string): Observable<ProcessFilterCloudModel[]> {
        return this.preferenceService.getPreferenceByKey(appName, key);
    }

    /**
     * Calls update preference api to update process instance filter
     * @param appName Name of the target app
     * @param key Key of the process instance filters
     * @param filters Details of update filter
     * @returns Observable of updated process instance filters
     */
    private updateProcessFilters(appName: string, key: string, filters: ProcessFilterCloudModel[]): Observable<ProcessFilterCloudModel[]> {
        return this.preferenceService.updatePreference(appName, key, filters);
    }

    /**
     * Creates a uniq key with appName and username
     * @param appName Name of the target app
     * @returns String of process instance filters preference key
     */
    private prepareKey(appName: string): string {
        const user: IdentityUserModel = this.identityUserService.getCurrentUserInfo();
        return `process-filters-${appName}-${user.username}`;
    }

    /**
     * Finds and returns the process instance filters from preferences
     * @param appName Name of the target app
     * @returns Array of ProcessFilterCloudModel
     */
    private findFiltersByKeyInPreferences(preferences: any, key: string): ProcessFilterCloudModel[] {
        const result = preferences.find((filter: any) => { return filter.entry.key === key; });
        return result && result.entry ? JSON.parse(result.entry.value) : [];
    }

    private addFiltersToStream(filters: ProcessFilterCloudModel[]) {
        this.filtersSubject.next(filters);
    }

    private handleProcessError(error: any) {
        return throwError(error || 'Server error');
    }

    /**
     * Creates and returns the default filters for a process app.
     * @param appName Name of the target app
     * @returns Array of ProcessFilterCloudModel
     */
    private defaultProcessFilters(appName: string): ProcessFilterCloudModel[] {
        return [
            new ProcessFilterCloudModel({
                name: 'ADF_CLOUD_PROCESS_FILTERS.ALL_PROCESSES',
                key: 'all-processes',
                icon: 'adjust',
                appName: appName,
                sort: 'startDate',
                status: '',
                order: 'DESC'
            }),
            new ProcessFilterCloudModel({
                name: 'ADF_CLOUD_PROCESS_FILTERS.RUNNING_PROCESSES',
                icon: 'inbox',
                key: 'running-processes',
                appName: appName,
                sort: 'startDate',
                status: 'RUNNING',
                order: 'DESC'
            }),
            new ProcessFilterCloudModel({
                name: 'ADF_CLOUD_PROCESS_FILTERS.COMPLETED_PROCESSES',
                icon: 'done',
                key: 'completed-processes',
                appName: appName,
                sort: 'startDate',
                status: 'COMPLETED',
                order: 'DESC'
            })
        ];
    }
}
