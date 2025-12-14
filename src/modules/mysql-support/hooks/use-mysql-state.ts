import { useState, useCallback } from 'react';

/**
 * Hook for managing MySQL state in the add site form
 */
export function useMySQLState() {
	const [ useMySQL, setUseMySQL ] = useState( false );
	
	const toggleMySQL = useCallback( ( value: boolean ) => {
		console.log( `[MySQL] useMySQLState - toggling MySQL to: ${ value }` );
		setUseMySQL( value );
	}, [] );
	
	const resetMySQL = useCallback( () => {
		console.log( `[MySQL] useMySQLState - resetting MySQL to false` );
		setUseMySQL( false );
	}, [] );
	
	return {
		useMySQL,
		setUseMySQL: toggleMySQL,
		resetMySQL
	};
} 