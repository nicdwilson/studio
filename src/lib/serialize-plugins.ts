export function serializePlugins( plugins: string[] ): string {
	const serializedArray = plugins
		.map( ( plugin, index ) => `i:${ index };s:${ plugin.length }:"${ plugin }";` )
		.join( '' );
	return `a:${ plugins.length }:{${ serializedArray }}`;
}

/**
 * Serialize a value in PHP format for WordPress options
 * This handles arrays, objects, and primitive types
 */
export function serializeForWordPress( value: any ): string {
	if ( Array.isArray( value ) ) {
		const serializedArray = value
			.map( ( item, index ) => {
				if ( typeof item === 'string' ) {
					return `i:${ index };s:${ item.length }:"${ item }";`;
				} else if ( typeof item === 'number' ) {
					return `i:${ index };i:${ item };`;
				} else if ( typeof item === 'boolean' ) {
					return `i:${ index };b:${ item ? '1' : '0' };`;
				} else if ( item === null ) {
					return `i:${ index };N;`;
				} else if ( typeof item === 'object' ) {
					// For objects, serialize as JSON string
					const jsonString = JSON.stringify( item );
					return `i:${ index };s:${ jsonString.length }:"${ jsonString }";`;
				} else {
					// Fallback for other types
					const stringValue = String( item );
					return `i:${ index };s:${ stringValue.length }:"${ stringValue }";`;
				}
			} )
			.join( '' );
		return `a:${ value.length }:{${ serializedArray }}`;
	} else if ( typeof value === 'object' && value !== null ) {
		// For objects, use JSON serialization
		return JSON.stringify( value );
	} else if ( typeof value === 'string' ) {
		return value;
	} else if ( typeof value === 'number' ) {
		return String( value );
	} else if ( typeof value === 'boolean' ) {
		return value ? '1' : '0';
	} else if ( value === null ) {
		return '';
	} else {
		return String( value );
	}
}
